'use client';

import * as React from 'react';
import {
  IconChevronsLeft,
  IconChevronsRight,
  IconSearch,
} from '@tabler/icons-react';

import { Icon } from './Icon';
import { cn } from '../lib/utils';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { ToggleButton } from './ToggleButton';
import { getPaginationItems } from '../lib/pagination';
import { InputGroup, InputGroupAddon, InputGroupInput } from './InputGroup';

// ─── DataTable (root container) ─────────────────────────────────────────────

function DataTable({
  children,
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="data-table"
      className={cn(
        'bg-card shadow-100 in-data-[slot=card]:shadow-50 overflow-hidden rounded-xl in-data-[slot=card]:rounded-md',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── DataTableToolbar ───────────────────────────────────────────────────────

function DataTableToolbar({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="data-table-toolbar"
      className={cn('border-b p-2 transition-colors', className)}
      {...props}
    />
  );
}

// ─── DataTableTabs (filter tabs: All / Active / Inactive) ───────────────────

interface DataTableTabItem {
  label: string;
  value: string;
  count?: number;
}

interface DataTableTabsProps {
  tabs: DataTableTabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function DataTableTabs({
  className,
  onChange,
  tabs,
  value,
}: DataTableTabsProps) {
  return (
    <div
      data-slot="data-table-tabs"
      className={cn('flex items-center gap-1', className)}
    >
      {tabs.map((tab) => (
        <ToggleButton
          key={tab.value}
          isSelected={value === tab.value}
          size="sm"
          onPress={() => onChange(tab.value)}
          className="px-3"
        >
          {tab.label}
          {tab.count != null && (
            <span className="text-muted-foreground text-xs">{tab.count}</span>
          )}
        </ToggleButton>
      ))}
    </div>
  );
}

// ─── DataTableSearch ────────────────────────────────────────────────────────

interface DataTableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onCancel?: () => void;
  className?: string;
}

function DataTableSearch({
  className,
  onCancel,
  onChange,
  placeholder = 'Search…',
  value,
}: DataTableSearchProps) {
  return (
    <div
      data-slot="data-table-search"
      className={cn('flex items-center gap-2 border-b p-1.5', className)}
    >
      <InputGroup size="sm" className="hover:bg-muted border-none shadow-none">
        <InputGroupAddon>
          <Icon icon={IconSearch} size="sm" />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus={!!onCancel}
          type="text"
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.value)
          }
          placeholder={placeholder}
        />
      </InputGroup>
      {onCancel && (
        <Button variant="ghost" size="sm" onPress={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}

// ─── DataTableBulkActions ───────────────────────────────────────────────────

interface DataTableBulkActionsProps {
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
  children: React.ReactNode;
  className?: string;
}

function DataTableBulkActions({
  allSelected,
  children,
  className,
  onToggleAll,
  selectedCount,
}: DataTableBulkActionsProps) {
  const isIndeterminate = selectedCount > 0 && !allSelected;

  return (
    <div
      data-slot="data-table-bulk-actions"
      className={cn(
        'bg-muted/30 flex h-[calc(var(--spacing)*9+0.5px)] items-center gap-3 border-b px-4 py-1.5',
        className,
      )}
    >
      <Checkbox
        isSelected={allSelected}
        isIndeterminate={isIndeterminate}
        onChange={onToggleAll}
        aria-label="Toggle all"
      />
      <span className="text-sm font-medium">{selectedCount} selected</span>
      <div className="ml-auto flex items-center gap-1.5">{children}</div>
    </div>
  );
}

// ─── DataTableContent ───────────────────────────────────────────────────────

function DataTableContent({
  children,
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div data-slot="data-table-content" className={cn(className)} {...props}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

// ─── DataTableHeader ────────────────────────────────────────────────────────

function DataTableHeader({
  className,
  ...props
}: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="data-table-header"
      className={cn('bg-muted/50 sticky top-0 h-9 border-b', className)}
      {...props}
    />
  );
}

// ─── DataTableBody ──────────────────────────────────────────────────────────

function DataTableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody data-slot="data-table-body" className={cn(className)} {...props} />
  );
}

// ─── DataTableRow ───────────────────────────────────────────────────────────

function DataTableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="data-table-row"
      className={cn(
        'hover:bg-muted/50 min-h-12 border-b transition-colors last:border-b-0',
        className,
      )}
      {...props}
    >
      {props.children}
    </tr>
  );
}

// ─── DataTableHead ──────────────────────────────────────────────────────────

function DataTableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="data-table-head"
      className={cn(
        'text-muted-foreground px-4 py-1.5 text-left text-xs font-medium',
        className,
      )}
      {...props}
    />
  );
}

// ─── DataTableCell ──────────────────────────────────────────────────────────

function DataTableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="data-table-cell"
      className={cn('px-4 py-1.5', className)}
      {...props}
    >
      {props.children}
    </td>
  );
}

// ─── DataTableCheckbox ──────────────────────────────────────────────────────

interface DataTableCheckboxProps {
  checked: boolean;
  onChange: () => void;
  className?: string;
  'aria-label'?: string;
}

function DataTableCheckbox({
  'aria-label': ariaLabel,
  checked,
  className,
  onChange,
}: DataTableCheckboxProps) {
  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <Checkbox
        isSelected={checked}
        onChange={onChange}
        className={className}
        aria-label={ariaLabel}
        slot={null}
      />
    </span>
  );
}

// ─── DataTableEmpty ─────────────────────────────────────────────────────────

function DataTableEmpty({
  children,
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="data-table-empty"
      className={cn('flex w-full items-center justify-center', className)}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── DataTablePagination ───────────────────────────────────────────────────

interface DataTablePaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Total row count across all pages — renders the "1–20 of 240" label. */
  totalItems?: number;
  /** Rows per page — required alongside `totalItems` for the range label. */
  pageSize?: number;
  className?: string;
}

function DataTablePagination({
  className,
  onPageChange,
  page,
  pageCount,
  pageSize,
  totalItems,
}: DataTablePaginationProps) {
  if (pageCount <= 1) return null;

  const items = getPaginationItems(page, pageCount);

  const showRange = totalItems != null && pageSize != null;
  const from = (page - 1) * (pageSize ?? 0) + 1;
  const to = Math.min(page * (pageSize ?? 0), totalItems ?? 0);

  return (
    <div
      data-slot="data-table-pagination"
      className={cn(
        'flex items-center justify-between border-t px-4 py-2.5',
        className,
      )}
    >
      {showRange && (
        <span className="text-muted-foreground text-xs">
          {from}–{to} of {totalItems}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          isDisabled={page <= 1}
          onPress={() => onPageChange(1)}
          aria-label="First page"
        >
          <Icon icon={IconChevronsLeft} size="sm" />
        </Button>
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              aria-hidden
              className="text-muted-foreground px-1 text-xs"
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? 'default' : 'ghost'}
              size="icon-xs"
              aria-label={`Page ${item}`}
              aria-current={item === page ? 'page' : undefined}
              onPress={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          isDisabled={page >= pageCount}
          onPress={() => onPageChange(pageCount)}
          aria-label="Last page"
        >
          <Icon icon={IconChevronsRight} size="sm" />
        </Button>
      </div>
    </div>
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  DataTable,
  DataTableToolbar,
  DataTableTabs,
  DataTableSearch,
  DataTableBulkActions,
  DataTableContent,
  DataTableHeader,
  DataTableBody,
  DataTableRow,
  DataTableHead,
  DataTableCell,
  DataTableCheckbox,
  DataTableEmpty,
  DataTablePagination,
};

export type { DataTableTabItem, DataTablePaginationProps };
