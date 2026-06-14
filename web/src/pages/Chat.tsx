import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { IconAlertTriangle, IconArrowUp } from '@tabler/icons-react';

import { Avatar } from 'ui/components/Avatar';
import { Button } from 'ui/components/Button';
import { Skeleton } from 'ui/components/Skeleton';
import { Textarea } from 'ui/components/Textarea';
import { toast } from 'ui/components/Toast';

import {
  CommandError,
  call,
  chatEventsUrl,
  chatHistory,
  openChat,
  sendChatMessage,
} from '../lib/api';
import type { ChatEvent, ChatHistoryEntry } from '../lib/api';

interface AgentGroup {
  id: string;
  name?: string;
}

type Message = ChatHistoryEntry & { pending?: boolean };

/** Hide the typing indicator if no refresh arrives within this window. */
const TYPING_TTL_MS = 8_000;

export function Chat() {
  const { groupId } = useParams({ from: '/agents/$groupId/chat' });

  const [agent, setAgent] = useState<AgentGroup | null>(null);
  const [platformId, setPlatformId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpTyping = useCallback(() => {
    setTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), TYPING_TTL_MS);
  }, []);

  const clearTyping = useCallback(() => {
    setTyping(false);
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
  }, []);

  // Open (or find) the conversation and load its transcript.
  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setPlatformId(null);
    setError(null);

    (async () => {
      const [group, opened, history] = await Promise.all([
        call<AgentGroup>('groups-get', { id: groupId }),
        openChat(groupId),
        chatHistory(groupId),
      ]);
      if (cancelled) return;
      setAgent(group);
      setPlatformId(opened.platform_id);
      setMessages(history);
    })().catch((err) => {
      if (cancelled) return;
      setError(err instanceof CommandError ? err.message : 'Could not open the conversation.');
    });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  // Live events: agent replies + typing. EventSource reconnects on its own.
  useEffect(() => {
    if (!platformId) return;
    const source = new EventSource(chatEventsUrl(platformId));

    source.onmessage = (raw) => {
      let event: ChatEvent;
      try {
        event = JSON.parse(raw.data as string);
      } catch {
        return;
      }
      if (event.type === 'typing') {
        bumpTyping();
        return;
      }
      clearTyping();
      setMessages((prev) => [
        ...(prev ?? []),
        { id: event.id, role: 'agent', text: event.text, timestamp: event.timestamp },
      ]);
    };

    return () => {
      source.close();
      clearTyping();
    };
  }, [platformId, bumpTyping, clearTyping]);

  const send = useCallback(
    async (text: string) => {
      if (!platformId) return;
      const optimistic: Message = {
        id: `local-${Date.now()}`,
        role: 'user',
        text,
        timestamp: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...(prev ?? []), optimistic]);
      try {
        const id = await sendChatMessage(platformId, text);
        setMessages((prev) =>
          (prev ?? []).map((m) => (m.id === optimistic.id ? { ...m, id, pending: false } : m)),
        );
      } catch {
        setMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id));
        toast.error('Message failed to send. Try again.');
      }
    },
    [platformId],
  );

  const agentName = agent?.name || 'Agent';

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <IconAlertTriangle className="text-muted-foreground size-8" aria-hidden />
          <p className="font-medium">Can't open this chat</p>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background flex h-full flex-col">
      <MessageList messages={messages} typing={typing} agentName={agentName} />

      <Composer disabled={!platformId} onSend={send} agentName={agentName} />
    </div>
  );
}

function MessageList({
  messages,
  typing,
  agentName,
}: {
  messages: Message[] | null;
  typing: boolean;
  agentName: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Track whether the user has scrolled away from the bottom; only auto-stick
  // when they haven't (don't yank the view while reading history).
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  if (messages === null) {
    return (
      <div className="flex min-h-0 grow flex-col justify-end gap-3 px-6 py-4" aria-hidden>
        <Skeleton className="h-10 w-3/5 self-start rounded-xl" />
        <Skeleton className="h-10 w-2/5 self-end rounded-xl" />
        <Skeleton className="h-16 w-3/5 self-start rounded-xl" />
      </div>
    );
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 grow overflow-y-auto" role="log" aria-label="Messages">
      <div className="mx-auto flex max-w-2xl flex-col gap-2 px-6 py-4">
        {messages.length === 0 && !typing && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Avatar name={agentName} identity size="xl" />
            <p className="font-serif text-lg font-medium">Say hi</p>
            <p className="text-muted-foreground -mt-2 text-sm">
              This is your direct line to {agentName}.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {typing && <TypingBubble />}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const mine = message.role === 'user';
  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          mine
            ? `bg-primary text-primary-foreground max-w-[85%] rounded-xl rounded-br-md px-3.5 py-2 ${message.pending ? 'opacity-70' : ''}`
            : 'bg-muted text-foreground max-w-[85%] rounded-xl rounded-bl-md px-3.5 py-2'
        }
      >
        <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">{message.text}</div>
        <time
          dateTime={message.timestamp}
          className={`mt-0.5 block text-right text-[10px] tabular-nums ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start" aria-label="Agent is typing">
      <div className="bg-muted flex items-center gap-1 rounded-xl rounded-bl-md px-3.5 py-3">
        <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:0ms] motion-reduce:animate-none" />
        <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:150ms] motion-reduce:animate-none" />
        <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:300ms] motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function Composer({
  disabled,
  agentName,
  onSend,
}: {
  disabled: boolean;
  agentName: string;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState('');

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
  };

  return (
    <div className="shrink-0 border-t py-3">
      <form
        className="mx-auto flex max-w-2xl items-end gap-2 px-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          placeholder={`Message ${agentName}…`}
          aria-label={`Message ${agentName}`}
          className="min-h-10 max-h-40"
          rows={1}
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-full"
          isDisabled={disabled || !value.trim()}
          aria-label="Send message"
        >
          <IconArrowUp className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
