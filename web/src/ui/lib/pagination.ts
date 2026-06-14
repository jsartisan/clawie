export type PaginationItem = number | 'ellipsis';

function range(start: number, end: number): number[] {
  if (end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/**
 * Builds the list of page buttons for numbered pagination, collapsing long
 * ranges with `'ellipsis'` markers. Always keeps the first and last page
 * visible plus `siblingCount` pages on each side of the current page.
 *
 * e.g. page 10 of 20 → [1, 'ellipsis', 9, 10, 11, 'ellipsis', 20]
 */
export function getPaginationItems(
  currentPage: number,
  pageCount: number,
  siblingCount = 1,
): PaginationItem[] {
  // first + last + current + siblings on both sides + two ellipsis slots
  const totalPageNumbers = siblingCount * 2 + 5;

  if (pageCount <= totalPageNumbers) {
    return range(1, pageCount);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, pageCount);

  const showLeftEllipsis = leftSiblingIndex > 2;
  const showRightEllipsis = rightSiblingIndex < pageCount - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftItemCount = siblingCount * 2 + 3;
    return [...range(1, leftItemCount), 'ellipsis', pageCount];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightItemCount = siblingCount * 2 + 3;
    return [1, 'ellipsis', ...range(pageCount - rightItemCount + 1, pageCount)];
  }

  return [
    1,
    'ellipsis',
    ...range(leftSiblingIndex, rightSiblingIndex),
    'ellipsis',
    pageCount,
  ];
}
