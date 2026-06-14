import { useCallback, useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { IconDots, IconPlus, IconRefresh } from '@tabler/icons-react';

import { Button } from 'ui/components/Button';
import { Spinner } from 'ui/components/Spinner';
import { Badge } from 'ui/components/Badge';
import { ConfirmDialog } from 'ui/components/ConfirmDialog';
import { Empty, EmptyDescription, EmptyTitle } from 'ui/components/Empty';
import { toast } from 'ui/components/Toast';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableContent,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from 'ui/components/DataTable';

import type { CustomOperationSchema } from '../lib/api';
import { CommandError, list, remove } from '../lib/api';
import { useResource } from '../lib/schema';
import { formatCell, titleCase } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { ResourceForm } from '../components/ResourceForm';
import { CustomOpDialog } from '../components/CustomOpDialog';

type Row = Record<string, unknown>;

export function ResourcePage() {
  const { plural } = useParams({ strict: false }) as { plural?: string };
  const resource = useResource(plural);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [formState, setFormState] = useState<{ mode: 'create' | 'edit'; row?: Row } | null>(null);
  const [deleteRow, setDeleteRow] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [customOp, setCustomOp] = useState<{ op: CustomOperationSchema; row: Row } | null>(null);

  const load = useCallback(async () => {
    if (!resource) return;
    setLoading(true);
    try {
      setRows(await list<Row>(resource.plural));
    } catch (err) {
      toast.error(err instanceof CommandError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [resource]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!resource) {
    return <div className="p-8 text-muted-foreground">Unknown resource: {plural}</div>;
  }

  async function confirmDelete() {
    if (!deleteRow || !resource) return;
    setDeleting(true);
    try {
      await remove(resource.plural, String(deleteRow[resource.idColumn]));
      toast.success(`${titleCase(resource.name)} deleted`);
      setDeleteRow(null);
      void load();
    } catch (err) {
      toast.error(err instanceof CommandError ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const canCreate = !!resource.operations.create;
  const canUpdate = !!resource.operations.update;
  const canDelete = !!resource.operations.delete;
  const cols = resource.columns;

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title={titleCase(resource.plural)}
        description={resource.description}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" aria-label="Refresh" onPress={() => void load()}>
              <IconRefresh className="size-4" />
            </Button>
            {canCreate && (
              <Button onPress={() => setFormState({ mode: 'create' })}>
                <IconPlus className="size-4" /> New
              </Button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <Empty className="border">
          <EmptyTitle>No {titleCase(resource.plural).toLowerCase()} yet</EmptyTitle>
          <EmptyDescription>
            {canCreate ? 'Create one with the “New” button above.' : 'Nothing to show.'}
          </EmptyDescription>
        </Empty>
      ) : (
        <DataTable>
          <DataTableContent className="overflow-x-auto">
            <DataTableHeader>
              <DataTableRow>
                {cols.map((c) => (
                  <DataTableHead key={c.name}>{titleCase(c.name)}</DataTableHead>
                ))}
                <DataTableHead className="text-right">Actions</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {rows.map((row, i) => (
                <DataTableRow key={String(row[resource.idColumn] ?? i)}>
                  {cols.map((c) => (
                    <DataTableCell key={c.name} className="align-top">
                      <CellValue value={row[c.name]} type={c.type} />
                    </DataTableCell>
                  ))}
                  <DataTableCell className="text-right whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      {resource.customOperations.map((op) => (
                        <Button
                          key={op.name}
                          variant="ghost"
                          size="sm"
                          onPress={() => setCustomOp({ op, row })}
                        >
                          {titleCase(op.name)}
                        </Button>
                      ))}
                      {canUpdate && (
                        <Button variant="ghost" size="sm" onPress={() => setFormState({ mode: 'edit', row })}>
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onPress={() => setDeleteRow(row)}
                        >
                          Delete
                        </Button>
                      )}
                      {!canUpdate && !canDelete && resource.customOperations.length === 0 && (
                        <IconDots className="text-muted-foreground size-4" />
                      )}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTableContent>
        </DataTable>
      )}

      {formState && (
        <ResourceForm
          resource={resource}
          mode={formState.mode}
          initial={formState.row}
          isOpen
          onOpenChange={(open) => !open && setFormState(null)}
          onSaved={() => void load()}
        />
      )}

      {customOp && (
        <CustomOpDialog
          resource={resource}
          op={customOp.op}
          row={customOp.row}
          isOpen
          onOpenChange={(open) => !open && setCustomOp(null)}
          onDone={() => void load()}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteRow}
        onOpenChange={(open) => !open && setDeleteRow(null)}
        onConfirm={() => void confirmDelete()}
        title={`Delete ${titleCase(resource.name).toLowerCase()}?`}
        description={deleteRow ? String(deleteRow[resource.idColumn]) : undefined}
        confirmLabel="Delete"
        isPending={deleting}
      />
    </div>
  );
}

function CellValue({ type, value }: { value: unknown; type: string }) {
  if (type === 'boolean') {
    return <Badge variant={value ? 'success' : 'secondary'}>{value ? 'true' : 'false'}</Badge>;
  }
  const text = formatCell(value);
  return <span className="text-sm break-all">{text.length > 80 ? `${text.slice(0, 80)}…` : text}</span>;
}
