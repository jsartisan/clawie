import { useState } from 'react';

import { Modal } from 'ui/components/Modal';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from 'ui/components/Dialog';
import { Button } from 'ui/components/Button';
import { TextField } from 'ui/components/TextField';
import { Switch } from 'ui/components/Switch';
import { Select, SelectItem } from 'ui/components/Select';
import { toast } from 'ui/components/Toast';

import type { ColumnDef, ResourceSchema } from '../lib/api';
import { create, update, CommandError } from '../lib/api';
import { titleCase } from '../lib/format';

type Mode = 'create' | 'edit';

interface ResourceFormProps {
  resource: ResourceSchema;
  mode: Mode;
  /** Existing row when editing. */
  initial?: Record<string, unknown>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** Columns the user can fill, depending on mode. */
function editableColumns(resource: ResourceSchema, mode: Mode): ColumnDef[] {
  if (mode === 'create') return resource.columns.filter((c) => !c.generated);
  return resource.columns.filter((c) => c.updatable);
}

function initialValues(cols: ColumnDef[], initial?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) {
    if (initial && initial[c.name] !== undefined && initial[c.name] !== null) {
      out[c.name] = initial[c.name];
    } else if (c.default !== undefined) {
      out[c.name] = c.default;
    } else {
      out[c.name] = c.type === 'boolean' ? false : '';
    }
  }
  return out;
}

export function ResourceForm({ initial, isOpen, mode, onOpenChange, onSaved, resource }: ResourceFormProps) {
  const cols = editableColumns(resource, mode);
  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(cols, initial));
  const [pending, setPending] = useState(false);

  function setField(name: string, value: unknown) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function submit() {
    // Validate required fields (create only — edit sends a partial patch).
    if (mode === 'create') {
      for (const c of cols) {
        if (c.required && (values[c.name] === '' || values[c.name] === undefined)) {
          toast.error(`${titleCase(c.name)} is required`);
          return;
        }
      }
    }

    // Build the args: drop empty optional strings so we don't overwrite with ''.
    const args: Record<string, unknown> = {};
    for (const c of cols) {
      const v = values[c.name];
      if (v === '' && !c.required) continue;
      if (c.type === 'number' && v !== '' && v !== undefined) args[c.name] = Number(v);
      else args[c.name] = v;
    }

    setPending(true);
    try {
      if (mode === 'create') {
        await create(resource.plural, args);
        toast.success(`${titleCase(resource.name)} created`);
      } else {
        await update(resource.plural, { id: (initial as Record<string, unknown>)[resource.idColumn], ...args });
        toast.success(`${titleCase(resource.name)} updated`);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof CommandError ? err.message : 'Request failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} overlayClassName="!fixed">
      <Dialog className="w-[32rem] max-w-full">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {mode === 'create' ? 'New' : 'Edit'} {titleCase(resource.name)}
          </DialogTitle>
          {mode === 'edit' && (
            <DialogDescription>
              {String((initial as Record<string, unknown>)?.[resource.idColumn] ?? '')}
            </DialogDescription>
          )}
        </DialogHeader>

        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {cols.map((c) => (
            <Field key={c.name} column={c} value={values[c.name]} onChange={(v) => setField(c.name, v)} />
          ))}
          {cols.length === 0 && <p className="text-muted-foreground text-sm">Nothing editable on this resource.</p>}

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onPress={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" isDisabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Dialog>
    </Modal>
  );
}

function Field({ column, onChange, value }: { column: ColumnDef; value: unknown; onChange: (v: unknown) => void }) {
  const label = `${titleCase(column.name)}${column.required ? ' *' : ''}`;

  if (column.enum && column.enum.length > 0) {
    return (
      <Select
        label={label}
        selectedKey={(value as string) || null}
        onSelectionChange={(k) => onChange(k as string)}
        description={column.description}
      >
        {column.enum.map((opt) => (
          <SelectItem key={opt} id={opt}>
            {opt}
          </SelectItem>
        ))}
      </Select>
    );
  }

  if (column.type === 'boolean') {
    return (
      <div className="flex flex-col gap-1">
        <Switch isSelected={Boolean(value)} onChange={(v) => onChange(v)}>
          {label}
        </Switch>
        {column.description && <span className="text-muted-foreground text-xs">{column.description}</span>}
      </div>
    );
  }

  return (
    <TextField
      label={label}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(v) => onChange(v)}
      description={column.description}
      inputMode={column.type === 'number' ? 'numeric' : undefined}
    />
  );
}
