import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PdfColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

interface PdfExportOptions {
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: Record<string, string | number | null | undefined>[];
  companyName?: string;
  orientation?: 'portrait' | 'landscape';
}

/**
 * Generate and download a PDF report with company branding header,
 * table data, and page numbers.
 */
export function exportReportPdf(opts: PdfExportOptions): void {
  const { title, subtitle, columns, rows, companyName = 'FLC BI', orientation = 'landscape' } = opts;

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // ── Header ────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName, margin, 18);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(title, margin, 26);

  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(subtitle, margin, 32);
    doc.setTextColor(0);
  }

  // Date line
  doc.setFontSize(8);
  doc.setTextColor(130);
  const now = new Date();
  doc.text(`Generated: ${now.toLocaleDateString('en-MY')} ${now.toLocaleTimeString('en-MY')}`, pageWidth - margin, 18, { align: 'right' });
  doc.setTextColor(0);

  // ── Table ─────────────────────────────────────────────────────
  const head = [columns.map(c => c.label)];
  const body = rows.map(row =>
    columns.map(c => {
      const v = row[c.key];
      if (v == null) return '—';
      if (c.numeric && typeof v === 'number') {
        return v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return String(v);
    }),
  );

  autoTable(doc, {
    head,
    body,
    startY: subtitle ? 36 : 32,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [30, 41, 59], // slate-800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    columnStyles: columns.reduce((acc, c, i) => {
      if (c.numeric) acc[i] = { halign: 'right' };
      return acc;
    }, {} as Record<number, { halign: string }>),
    didDrawPage: (data) => {
      // Footer with page number
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(130);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' },
      );
      doc.text(
        `${rows.length.toLocaleString()} records`,
        pageWidth - margin,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' },
      );
      doc.setTextColor(0);
    },
  });

  // ── Download ──────────────────────────────────────────────────
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
