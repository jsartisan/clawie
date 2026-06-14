import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { Avatar } from 'ui/components/Avatar';
import { Button } from 'ui/components/Button';
import { Card, CardContent } from 'ui/components/Card';
import { Label } from 'ui/components/Label';
import { TextField } from 'ui/components/TextField';
import { Textarea } from 'ui/components/Textarea';
import { toast } from 'ui/components/Toast';

import { CommandError, call } from '../lib/api';

const PERSONALITY_PRESETS: Array<{ label: string; text: string }> = [
  {
    label: 'Personal assistant',
    text: 'You are a sharp, proactive personal assistant. Keep replies short and useful. Ask before taking actions that affect the outside world.',
  },
  {
    label: 'Research analyst',
    text: 'You are a thorough research analyst. Verify claims with sources, summarize crisply, and flag uncertainty explicitly.',
  },
  {
    label: 'Friendly companion',
    text: 'You are warm, curious, and conversational. Match the user\'s tone and keep things light unless they need real help.',
  },
];

/**
 * Create-agent wizard: name + personality → agent group + webchat wiring →
 * straight into a live conversation. One screen, no steps to get lost in.
 */
export function CreateAgent() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!name.trim()) return toast.error('Give your agent a name');
    setPending(true);
    try {
      const created = await call<{ id: string; name: string }>('agent-create', {
        name: name.trim(),
        instructions: instructions.trim(),
      });
      toast.success(`${created.name} is ready`);
      navigate({ to: '/agents/$groupId/chat', params: { groupId: created.id } });
    } catch (err) {
      toast.error(err instanceof CommandError ? err.message : 'Failed to create the agent');
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 pt-12 pb-16">
      <div>
        <h1 className="font-serif text-[26px] leading-tight font-medium tracking-tight">Create an agent</h1>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          Name it, give it a personality, and start chatting right away.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5 py-5">
          <div className="flex items-end gap-3">
            <Avatar name={name.trim() || '?'} identity={Boolean(name.trim())} size="lg" />
            <TextField
              label="Name *"
              autoFocus
              placeholder="e.g. Andy"
              value={name}
              onChange={setName}
              maxLength={60}
              className="grow"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-instructions">Personality &amp; instructions</Label>
            <Textarea
              id="agent-instructions"
              placeholder="What should this agent be like? What is it for?"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-28"
            />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {PERSONALITY_PRESETS.map((p) => (
                <Button key={p.label} variant="outline" size="xs" onPress={() => setInstructions(p.text)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <Button onPress={submit} isDisabled={pending || !name.trim()} className="self-end">
            {pending ? 'Creating…' : 'Create & chat'}
          </Button>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        You can connect Telegram or Slack to this agent later from its settings.
      </p>
    </div>
  );
}
