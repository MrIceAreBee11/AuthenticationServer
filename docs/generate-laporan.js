/**
 * Generator dokumen laporan teknis (.docx)
 * Jalankan: node docs/generate-laporan.js
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  BorderStyle,
  PageBreak,
  TableOfContents,
  LevelFormat,
  PageNumber,
  Footer,
} = require('docx');

const W = 9026; // lebar area teks A4 dengan margin 1 inci (DXA)
const MONO = 'Consolas';
const BODY = 'Calibri';

/* ---------- helper ---------- */
const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [new TextRun({ text, font: BODY, bold: true, size: 32, color: '1F3864' })],
  });
const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, font: BODY, bold: true, size: 26, color: '2E5496' })],
  });
const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 110 },
    children: [new TextRun({ text, font: BODY, bold: true, size: 23, color: '44546A' })],
  });
const p = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 140, line: 300 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, font: BODY, size: 22, ...opts })],
  });
/** paragraf dengan penggalan tebal: rich(['biasa ', ['tebal', true], ' biasa']) */
const rich = (parts) =>
  new Paragraph({
    spacing: { after: 140, line: 300 },
    alignment: AlignmentType.JUSTIFIED,
    children: parts.map((x) =>
      Array.isArray(x)
        ? new TextRun({ text: x[0], font: BODY, size: 22, bold: !!x[1], italics: !!x[2] })
        : new TextRun({ text: x, font: BODY, size: 22 })
    ),
  });
const quote = (text) =>
  new Paragraph({
    spacing: { before: 120, after: 160, line: 300 },
    indent: { left: 400 },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: '2E5496', space: 12 } },
    children: [new TextRun({ text, font: BODY, size: 22, italics: true, color: '1F3864' })],
  });
const li = (text, level = 0) =>
  new Paragraph({
    numbering: { reference: 'peluru', level },
    spacing: { after: 80, line: 290 },
    children: [new TextRun({ text, font: BODY, size: 22 })],
  });
const num = (text) =>
  new Paragraph({
    numbering: { reference: 'angka', level: 0 },
    spacing: { after: 80, line: 290 },
    children: [new TextRun({ text, font: BODY, size: 22 })],
  });
const code = (lines) =>
  lines.map(
    (line, i) =>
      new Paragraph({
        spacing: { after: i === lines.length - 1 ? 160 : 0, before: i === 0 ? 60 : 0 },
        shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
        indent: { left: 200, right: 200 },
        children: [new TextRun({ text: line || ' ', font: MONO, size: 18 })],
      })
  );
const caption = (text) =>
  new Paragraph({
    spacing: { after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, font: BODY, size: 18, italics: true, color: '595959' })],
  });
const cell = (text, { bold = false, fill = null, width } = {}) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: String(text)
      .split(' ')
      .map(
        (t) =>
          new Paragraph({
            spacing: { after: 0, line: 260 },
            children: [new TextRun({ text: t, font: BODY, size: 19, bold })],
          })
      ),
  });
const table = (headers, rows, widths) =>
  new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((t, i) => cell(t, { bold: true, fill: 'D9E2F3', width: widths[i] })),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((t, i) => cell(t, { width: widths[i] })),
          })
      ),
    ],
  });
const br = () => new Paragraph({ children: [new PageBreak()] });
const gap = (n = 1) =>
  Array.from({ length: n }, () => new Paragraph({ children: [new TextRun('')] }));

const NL = ' '; // pemisah baris di dalam sel tabel

/* ---------- muat isi bab dari berkas terpisah ---------- */
const bagian = require('./isi-laporan.js')({
  h1,
  h2,
  h3,
  p,
  rich,
  quote,
  li,
  num,
  code,
  caption,
  table,
  br,
  gap,
  NL,
});

/* ---------- halaman judul ---------- */
const judul = [
  ...gap(6),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({ text: 'LAPORAN TEKNIS', font: BODY, size: 28, bold: true, color: '595959' }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [
      new TextRun({
        text: 'Pengembangan Authentication &',
        font: BODY,
        size: 48,
        bold: true,
        color: '1F3864',
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [
      new TextRun({
        text: 'Authorization Service',
        font: BODY,
        size: 48,
        bold: true,
        color: '1F3864',
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    border: { top: { style: BorderStyle.SINGLE, size: 12, color: '2E5496', space: 12 } },
    children: [
      new TextRun({
        text: 'Node.js · Express · PostgreSQL · Redis · RabbitMQ · MinIO · Docker',
        font: BODY,
        size: 22,
        color: '44546A',
      }),
    ],
  }),
  ...gap(4),
  new Table({
    width: { size: 6200, type: WidthType.DXA },
    columnWidths: [2200, 4000],
    alignment: AlignmentType.CENTER,
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      ['Disusun oleh', 'Satya Rayyis Baruna'],
      ['Posisi', 'Junior Developer'],
      ['Pembimbing', 'Khairul Umam'],
      ['Perusahaan', 'PT Digital Infra Teknologi (DTECH)'],
      ['Tahun', '2026'],
    ].map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 2200, type: WidthType.DXA },
              margins: { top: 60, bottom: 60 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: k, font: BODY, size: 22, color: '595959' })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 4000, type: WidthType.DXA },
              margins: { top: 60, bottom: 60 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: v, font: BODY, size: 22, bold: true })],
                }),
              ],
            }),
          ],
        })
    ),
  }),
  br(),
];

/* ---------- daftar isi ---------- */
const daftarIsi = [
  h1('Daftar Isi'),
  new TableOfContents('Daftar Isi', { hyperlink: true, headingStyleRange: '1-3' }),
  br(),
];

/* ---------- rakit dokumen ---------- */
const doc = new Document({
  creator: 'Satya Rayyis Baruna',
  title: 'Laporan Teknis - Authentication & Authorization Service',
  description: 'Laporan pengembangan auth service di PT Digital Infra Teknologi',
  features: { updateFields: true },
  numbering: {
    config: [
      {
        reference: 'peluru',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 460, hanging: 240 } } },
          },
          {
            level: 1,
            format: LevelFormat.BULLET,
            text: '◦',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 900, hanging: 240 } } },
          },
        ],
      },
      {
        reference: 'angka',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 460, hanging: 240 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: BODY,
                  size: 18,
                  color: '808080',
                }),
              ],
            }),
          ],
        }),
      },
      children: [...judul, ...daftarIsi, ...bagian],
    },
  ],
});

const out = path.join(__dirname, 'Laporan-Auth-Service.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log('Dokumen dibuat:', out, `(${(buf.length / 1024).toFixed(0)} KB)`);
});
