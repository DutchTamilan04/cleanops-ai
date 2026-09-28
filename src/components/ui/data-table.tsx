import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyMessage,
  caption,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage: string;
  caption?: string;
}) {
  if (!rows.length) return <p className="recordNote">{emptyMessage}</p>;
  return (
    <div className="ui-dataTable">
      <table>
        {caption ? <caption className="ui-dataTable-caption">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column.key} data-align={column.align === "right" ? "right" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} data-align={column.align === "right" ? "right" : undefined} data-label={column.header}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
