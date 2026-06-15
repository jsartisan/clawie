import { useCallback, useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { IconAlertTriangle, IconArrowUp } from '@tabler/icons-react';

import {
  Avatar,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Loader,
  Message,
  MessageContent,
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  Response,
  Skeleton,
  toast,
} from 'ui';

import { CommandError, call, chatEventsUrl, chatHistory, openChat, sendChatMessage } from '../lib/api';
import type { ChatEvent, ChatHistoryEntry } from '../lib/api';

interface AgentGroup {
  id: string;
  name?: string;
}

type Msg = ChatHistoryEntry & { pending?: boolean };

/** Hide the typing indicator if no refresh arrives within this window. */
const TYPING_TTL_MS = 8_000;

export function Chat() {
  const { groupId } = useParams({ from: '/agents/$groupId/chat' });

  const [agent, setAgent] = useState<AgentGroup | null>(null);
  const [platformId, setPlatformId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typingTimerRef = { current: null as ReturnType<typeof setTimeout> | null };

  const bumpTyping = useCallback(() => {
    setTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setTyping(false), TYPING_TTL_MS);
  }, []);

  const clearTyping = useCallback(() => {
    setTyping(false);
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

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
      const optimistic: Msg = {
        id: `local-${Date.now()}`,
        role: 'user',
        text,
        timestamp: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...(prev ?? []), optimistic]);
      try {
        const id = await sendChatMessage(platformId, text);
        setMessages((prev) => (prev ?? []).map((m) => (m.id === optimistic.id ? { ...m, id, pending: false } : m)));
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

function MessageList({ messages, typing, agentName }: { messages: Msg[] | null; typing: boolean; agentName: string }) {
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
    <Conversation className="min-h-0 grow" aria-label="Messages">
      <ConversationContent className="mx-auto max-w-2xl px-6 py-4">
        {messages.length === 0 && !typing && (
          <ConversationEmptyState
            icon={<Avatar name={agentName} identity size="xl" />}
            title="Say hi"
            description={`This is your direct line to ${agentName}.`}
            className="py-20"
          />
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {typing && <TypingBubble agentName={agentName} />}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

function MessageBubble({ message }: { message: Msg }) {
  const from = message.role === 'user' ? 'user' : 'assistant';
  return (
    <Message from={from} className={message.pending ? 'opacity-70' : ''}>
      <MessageContent>
        {message.role === 'user' ? (
          <p className="leading-relaxed break-words whitespace-pre-wrap">{message.text}</p>
        ) : (
          <Response>{message.text}</Response>
        )}
        <time dateTime={message.timestamp} className="block text-right text-[10px] tabular-nums opacity-60">
          {formatTime(message.timestamp)}
        </time>
      </MessageContent>
    </Message>
  );
}

function TypingBubble({ agentName }: { agentName: string }) {
  return (
    <Message from="assistant" aria-label={`${agentName} is typing`}>
      <MessageContent className="px-4 py-3">
        <Loader size={14} className="text-muted-foreground" />
      </MessageContent>
    </Message>
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
    <div className="shrink-0 py-3">
      <div className="mx-auto max-w-2xl px-6">
        <PromptInput onSubmit={submit}>
          <PromptInputTextarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={disabled}
            placeholder={`Message ${agentName}…`}
            aria-label={`Message ${agentName}`}
          />
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit isDisabled={disabled || !value.trim()}>
              <IconArrowUp className="size-4" />
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
