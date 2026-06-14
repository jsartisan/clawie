import { useState } from 'react';

import { Modal } from 'ui/components/Modal';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from 'ui/components/Dialog';
import { Button } from 'ui/components/Button';
import { TextField } from 'ui/components/TextField';
import { Select, SelectItem } from 'ui/components/Select';
import { toast } from 'ui/components/Toast';

import type { CustomOperationSchema, ResourceSchema } from '../lib/api';
import { custom, CommandError } from '../lib/api';
import { titleCase } from '../lib/format';

interface CustomOpDialogProps {
  resource: ResourceSchema;
  op: CustomOperationSchema;
  /** The row this op acts on — its id is auto-filled into the `id` arg. */
  row: Record<string, unknown>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

function isSecretArg(name: string): boolean {
  return /secret|token|value|password|key/i.test(name);
}

export function CustomOpDialog({ isOpen, onDone, onOpenChange, op, resource, row }: CustomOpDialogProps) {
  // Args the user fills — `id` is taken from the row, not asked for.
  const fields = op.args.filter((a) => a.name !== 'id');
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit() {
    for (const a of fields) {
      if (a.required && !values[a.name]) {
        toast.error(`${titleCase(a.name)} is required`);
        return;
      }
    }
    setPending(true);
    try {
      await custom(resource.plural, op.name, {
        id: row[resource.idColumn],
        ...values,
      });
      toast.success(`${titleCase(op.name)} done`);
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof CommandError ? err.message : 'Request failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} overlayClassName="!fixed">
      <Dialog className="w-[30rem] max-w-full">
        <DialogHeader>
          <DialogTitle className="text-lg">{titleCase(op.name)}</DialogTitle>
          <DialogDescription>{op.description}</DialogDescription>
        </DialogHeader>

        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {fields.map((a) =>
            a.enum && a.enum.length > 0 ? (
              <Select
                key={a.name}
                label={`${titleCase(a.name)}${a.required ? ' *' : ''}`}
                selectedKey={values[a.name] ?? null}
                onSelectionChange={(k) => setValues((v) => ({ ...v, [a.name]: String(k) }))}
                description={a.description}
              >
                {a.enum.map((opt) => (
                  <SelectItem key={opt} id={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </Select>
            ) : (
              <TextField
                key={a.name}
                label={`${titleCase(a.name)}${a.required ? ' *' : ''}`}
                type={isSecretArg(a.name) ? 'password' : 'text'}
                value={values[a.name] ?? ''}
                onChange={(val) => setValues((v) => ({ ...v, [a.name]: val }))}
                description={a.description}
              />
            ),
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onPress={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isDisabled={pending}>
              {pending ? 'Running…' : 'Run'}
            </Button>
          </div>
        </form>
      </Dialog>
    </Modal>
  );
}
