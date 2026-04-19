'use client';

import { useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthUser } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BarChart3,
  Boxes,
  Calendar,
  CircleAlert,
  CreditCard,
  FileText,
  Hash,
  PackageCheck,
  Plus,
  ReceiptText,
  Send,
  Sparkles,
  Truck,
  UploadCloud,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import { DEFAULT_PAGE_SIZE, paginateRows } from '@/lib/pagination';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import EntryPreviewSheet, { PreviewKeyValueGrid } from '@/components/ui/entry-preview-sheet';
import PaginationControls from '@/components/ui/pagination-controls';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { DatePicker } from '@/components/ui/date-picker';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { arrivalFormSchema, dispatchFormSchema } from '@/lib/forms/stock-forms';
import { useStockFormStore } from '@/lib/stores/stock-form-store';

function createArrivalItemRow() {
  return {
    itemId: '',
    sku: '',
    itemName: '',
    brandName: '',
    divisionName: '',
    typeName: '',
    sizeLabel: '',
    sizeUnit: 'mm',
    hsnCode: '',
    thicknessMm: '',
    qtySqm: '',
    costPerSqm: '',
    tilesPerBox: '',
    piecesPerBox: '',
    reorderLevel: '',
    description: '',
    wholeQty: '0',
    brokenQty: '0',
    notes: '',
  };
}

function createDispatchItemRow() {
  return {
    itemId: '',
    loadedWholeQty: '0',
    loadedBrokenQty: '0',
    notes: '',
  };
}

function createInitialArrivalDraft() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // yyyy-MM-dd

  return {
    shipmentNumber: '',
    supplierName: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    invoiceDate: dateStr,
    originCity: '',
    destinationWarehouseName: '',
    paymentStatus: 'unpaid',
    paidAmount: '',
    paymentDate: '',
    paymentReference: '',
    paymentMode: '',
    transportCost: '',
    laborCost: '',
    notes: '',
    items: [createArrivalItemRow()],
  };
}

function createInitialDispatchDraft() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 5); // HH:mm
  const fullDateTime = `${dateStr}T${timeStr}`;

  return {
    shipmentNumber: '',
    customerName: '',
    truckLicensePlate: '',
    driverName: '',
    invoiceNumber: '',
    salespersonName: '',
    dispatchDate: fullDateTime,
    transportCost: '',
    laborCost: '',
    notes: '',
    items: [createDispatchItemRow()],
  };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trimText(value) {
  return String(value ?? '').trim();
}

function parseSizeLabelSqm(sizeLabel) {
  const clean = trimText(sizeLabel).toLowerCase().replace(/\s+/g, '');
  const match = clean.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(mm)?$/);
  if (!match) {
    return null;
  }

  const widthMm = Number(match[1]);
  const lengthMm = Number(match[2]);
  if (!Number.isFinite(widthMm) || !Number.isFinite(lengthMm) || widthMm <= 0 || lengthMm <= 0) {
    return null;
  }

  return (widthMm / 1000) * (lengthMm / 1000);
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function normalizeGeneratedByRole(role) {
  const normalized = String(role || '').trim().toLowerCase();

  if (normalized === 'admin') return 'admin';
  if (normalized === 'manager') return 'manager';
  if (normalized === 'salesperson' || normalized === 'sales_person' || normalized === 'sales') return 'salesperson';
  if (normalized === 'stock_maintainer') return 'stock_maintainer';
  return 'unknown';
}

function getGeneratedByRoleBadgeClass(role) {
  switch (normalizeGeneratedByRole(role)) {
    case 'admin':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'manager':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'salesperson':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'stock_maintainer':
      return 'border-slate-200 bg-slate-50 text-slate-700';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

function getGeneratedByRoleLabel(role) {
  const normalized = normalizeGeneratedByRole(role);

  if (normalized === 'admin') return 'Admin';
  if (normalized === 'manager') return 'Manager';
  if (normalized === 'salesperson') return 'Salesperson';
  if (normalized === 'stock_maintainer') return 'Maintainer';
  return 'Legacy';
}

const FORM_LABEL_CLASS = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/75';
const FORM_INPUT_CLASS = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20';
const FORM_CARD_CLASS = 'rounded-2xl border border-border/80 bg-muted/20 p-4';

const CLASSES = {
  contentWrap: 'mx-auto w-full max-w-[1600px] space-y-6',
  topCard: 'rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900',
  interactiveCard: 'rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900',
  statGrid: 'grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6',
  statCard: 'min-w-0 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-md sm:p-6 dark:border-slate-700 dark:bg-slate-900',
  statLabel: 'text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400',
  statValue: 'mt-2 break-all text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white',
  iconButton: 'h-9 w-9 rounded-xl hover:bg-slate-100 transition-all active:scale-95 dark:hover:bg-slate-800',
};

const INVOICE_CLASSES = {
  surface: 'rounded-2xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-950',
  commandCard: 'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950',
  supplierTitle: 'text-xl font-bold text-slate-900 dark:text-white',
  supplierMeta: 'mt-1 text-xs text-slate-500 dark:text-slate-400',
  logisticsGrid: 'grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800',
  logisticsCell: 'border-b border-r border-slate-200 bg-slate-50/50 p-3 last:border-r-0 dark:border-slate-800 dark:bg-slate-900/50',
  logisticsLabel: 'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400',
  logisticsValue: 'mt-1 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100',
  subBar: 'flex flex-wrap gap-6 rounded-lg bg-slate-100 px-4 py-2 text-[10px] font-mono text-slate-500 dark:bg-slate-800/50 dark:text-slate-300',
  tableWrap: 'overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800',
  tableHead: 'bg-slate-900 text-white text-[10px] uppercase tracking-widest',
  tableHeadCell: 'px-4 py-3 font-semibold',
  tableRow: 'border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40',
  tableCell: 'px-4 py-3 text-sm text-slate-700 dark:text-slate-200',
  monoCell: 'font-mono text-sm text-slate-800 dark:text-slate-100',
  mobileGrid: 'grid grid-cols-2 gap-3 md:hidden',
  mobileCard: 'rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950',
  mobileCardHeader: 'rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white',
  mobileKey: 'text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400',
  mobileValue: 'font-mono text-xs text-slate-900 dark:text-slate-100',
};

function getStatusVariant(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('approved') || normalized.includes('active') || normalized.includes('complete')) {
    return 'approved';
  }
  if (normalized.includes('pending') || normalized.includes('review') || normalized.includes('warning')) {
    return 'pending';
  }
  if (normalized.includes('rejected') || normalized.includes('failed') || normalized.includes('critical')) {
    return 'rejected';
  }
  return 'neutral';
}

function renderDocumentPreview(document) {
  if (!document?.file_url) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No preview available.
      </div>
    );
  }

  if (document.mime_type?.startsWith('image/')) {
    return (
      <img
        src={document.file_url}
        alt={document.file_name || 'Document preview'}
        className="max-h-80 w-full rounded-2xl border border-slate-200 object-contain bg-black/5"
      />
    );
  }

  return (
    <iframe
      src={document.file_url}
      title={document.file_name || 'Document preview'}
      className="h-80 w-full rounded-2xl border border-slate-200 bg-white"
    />
  );
}

function normalizeSearchValue(value) {
  return trimText(value).toLowerCase();
}

function matchesQuery(value, query) {
  if (!query) {
    return true;
  }

  return normalizeSearchValue(value).includes(query);
}

function normalizeItemKey(value) {
  return normalizeSearchValue(value).replace(/\s+/g, ' ');
}

function findMatchingActiveItem(activeItems, value) {
  const normalizedValue = normalizeItemKey(value);
  if (!normalizedValue) {
    return null;
  }

  return (activeItems || []).find((item) => (
    normalizeItemKey(item.name) === normalizedValue || normalizeItemKey(item.sku) === normalizedValue
  )) || null;
}

function InlineNotice({ notice }) {
  if (!notice) {
    return null;
  }

  const toneClasses =
    notice.type === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : notice.type === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return <div className={`rounded-lg border px-3 py-2 text-sm ${toneClasses}`}>{notice.message}</div>;
}

function AttachmentField({ label, accept = 'image/*,.pdf', onChange, file, hint }) {
  return (
    <label className="block cursor-pointer">
      <span className={`${FORM_LABEL_CLASS} mb-2 flex items-center gap-2`}>
        {label}
      </span>
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 transition hover:border-primary/50 hover:bg-primary/10">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">
              {file ? 'Replace file' : 'Choose file'}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {hint || 'Attach a photo or PDF.'}
            </div>
            <div className="mt-2 text-xs font-medium text-primary">
              {file ? file.name : 'Click to upload'}
            </div>
          </div>
        </div>
      </div>
    </label>
  );
}

function FormSectionTitle({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

function StockFormField({ control, name, label, placeholder, type = 'text', className, ...props }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label ? <FormLabel className={FORM_LABEL_CLASS}>{label}</FormLabel> : null}
          <FormControl>
            <Input {...field} value={field.value ?? ''} type={type} placeholder={placeholder} className={className || FORM_INPUT_CLASS} {...props} />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

function StockMoneyField({ control, name, label, hint, placeholder = '0.00' }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={FORM_LABEL_CLASS}>{label}</FormLabel>
          <FormControl>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₹</span>
              <Input
                {...field}
                value={field.value ?? ''}
                type="number"
                min="0"
                step="0.01"
                placeholder={placeholder}
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-12 pr-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </FormControl>
          {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

function StockDateField({ control, name, label, placeholder, className }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={FORM_LABEL_CLASS}>{label}</FormLabel>
          <FormControl>
            <DatePicker
              value={field.value}
              onChange={field.onChange}
              placeholder={placeholder}
              className={className || FORM_INPUT_CLASS}
            />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

function StockDateTimeField({ control, name, label, placeholder, className }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={FORM_LABEL_CLASS}>{label}</FormLabel>
          <FormControl>
            <DateTimePicker
              value={field.value}
              onChange={field.onChange}
              datePlaceholder={placeholder}
              className={className}
            />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

async function fetchDashboardData() {
  const response = await fetch('/api/stock/dashboard');
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error || json.message || 'Fetch failed');
  }

  return json;
}

export default function StockDashboard() {
  const { language } = useLanguage();
  const t = (key) => getTranslation(`stock.dashboard.${key}`, language);
  const tc = {
    stockOperations: language === 'hi' ? 'स्टॉक संचालन' : 'Stock Operations',
    stockSubtitle: language === 'hi' ? 'मेंटेनर्स के लिए केंद्रित दृश्य: वर्तमान स्टॉक, खरीद और डिस्पैच।' : 'Focused view for maintainers: current stock, purchases, and dispatches.',
    searchItems: language === 'hi' ? 'SKU, नाम, साइज या मात्रा से आइटम खोजें' : 'Search items by SKU, name, size, or quantities',
    noStockItems: language === 'hi' ? 'इस फ़िल्टर के लिए कोई स्टॉक आइटम नहीं मिला।' : 'No stock items found for this filter.',
    resetSearch: language === 'hi' ? 'खोज रीसेट करें' : 'Reset Search',
    purchases: language === 'hi' ? 'खरीद' : 'Purchases',
    newPurchase: language === 'hi' ? 'नई खरीद' : 'New Purchase',
    insufficientNewPurchase: language === 'hi' ? 'नई खरीद के लिए अनुमति अपर्याप्त है' : 'Insufficient permission for New Purchase',
    logNewPurchase: language === 'hi' ? 'नई खरीद दर्ज करें' : 'Log New Purchase',
    purchaseSheetDesc: language === 'hi' ? 'आवक खरीद डिलीवरी और इनवॉइस विवरण दर्ज करें।' : 'Record an inbound purchase delivery and invoice details.',
    purchaseBasics: language === 'hi' ? 'खरीद की मूल जानकारी' : 'Purchase Basics',
    purchaseBasicsDesc: language === 'hi' ? 'इस स्टॉक खरीद के लिए मुख्य विवरण भरें।' : 'Enter core details for this stock purchase.',
    transportInvoice: language === 'hi' ? 'परिवहन और इनवॉइस' : 'Transport And Invoice',
    invoiceDate: language === 'hi' ? 'इनवॉइस तिथि' : 'Invoice Date',
    originCity: language === 'hi' ? 'मूल शहर' : 'Origin City',
    destinationWarehouse: language === 'hi' ? 'गंतव्य वेयरहाउस' : 'Destination Warehouse',
    invoicePhoto: language === 'hi' ? 'इनवॉइस फोटो' : 'Invoice photo',
    invoicePhotoHint: language === 'hi' ? 'खरीद इनवॉइस की फोटो या PDF।' : 'Purchase invoice photo or PDF.',
    transporterBillPhoto: language === 'hi' ? 'ट्रांसपोर्टर बिल फोटो' : 'Transporter bill photo',
    transporterBillHint: language === 'hi' ? 'ट्रक बिल, लॉरी रसीद, या ट्रांसपोर्टर बिल की फोटो।' : 'Truck bill, lorry receipt, or transporter bill photo.',
    amountInInr: language === 'hi' ? 'राशि INR में।' : 'Amount in INR.',
    paymentStatus: language === 'hi' ? 'भुगतान स्थिति' : 'Payment Status',
    unpaid: language === 'hi' ? 'अदेय' : 'Unpaid',
    partial: language === 'hi' ? 'आंशिक' : 'Partial',
    paid: language === 'hi' ? 'भुगतान किया गया' : 'Paid',
    paidAmount: language === 'hi' ? 'भुगतान राशि (INR)' : 'Paid Amount (INR)',
    paymentDate: language === 'hi' ? 'भुगतान तिथि' : 'Payment Date',
    paymentMode: language === 'hi' ? 'भुगतान माध्यम' : 'Payment Mode',
    paymentReference: language === 'hi' ? 'भुगतान संदर्भ' : 'Payment Reference',
    itemLabel: language === 'hi' ? 'आइटम' : 'Item',
    autofilledCatalog: language === 'hi' ? 'कैटलॉग से स्वतः भरा गया' : 'Autofilled from catalog',
    newTileEntry: language === 'hi' ? 'नई टाइल प्रविष्टि' : 'New tile entry',
    typeTileName: language === 'hi' ? 'टाइल नाम लिखें (मिलने पर ऑटो-फिल होगा)' : 'Type tile name (autocomplete will auto-fill if found)',
    itemAutofillHint: language === 'hi' ? 'यदि यह किसी मौजूदा टाइल से मेल खाता है तो विवरण स्वतः भर जाएगा। अन्यथा नीचे नई टाइल प्रविष्टि भरें।' : 'If this matches an existing tile, details auto-fill. Otherwise fill details below for new tile entry.',
    wholeBox: language === 'hi' ? 'संपूर्ण (बॉक्स)' : 'Whole(Box)',
    brokenTiles: language === 'hi' ? 'टूटी टाइलें' : 'Broken tiles',
    noPurchases: language === 'hi' ? 'अभी तक कोई खरीद दर्ज नहीं है।' : 'No purchases logged yet.',
    clearFilters: language === 'hi' ? 'फ़िल्टर साफ़ करें' : 'Clear Filters',
    generatedBy: language === 'hi' ? 'जनरेट किया गया द्वारा' : 'Generated By',
    approvedBy: language === 'hi' ? 'मंजूर किया गया द्वारा' : 'Approved By',
    invoice: language === 'hi' ? 'इनवॉइस' : 'Invoice',
    route: language === 'hi' ? 'रूट' : 'Route',
    payment: language === 'hi' ? 'भुगतान' : 'Payment',
    datetime: language === 'hi' ? 'दिनांक-समय' : 'Datetime',
    searchDispatches: language === 'hi' ? 'तारीख, उत्पाद, मात्रा, ट्रक या स्थिति से डिस्पैच खोजें' : 'Search dispatches by date, product, qty, truck, or status',
    salesInvoicePhoto: language === 'hi' ? 'बिक्री इनवॉइस फोटो' : 'Sales invoice photo',
    salesInvoiceHint: language === 'hi' ? 'बिक्री इनवॉइस की फोटो या PDF।' : 'Sales invoice photo or PDF.',
    gatepassPhoto: language === 'hi' ? 'गेटपास फोटो' : 'Gatepass photo',
    gatepassHint: language === 'hi' ? 'डिस्पैच यार्ड से निकलने से पहले का गेटपास फोटो।' : 'Gatepass photo before dispatch leaves the Godaam.',
    submitting: language === 'hi' ? 'जमा किया जा रहा है...' : 'Submitting...',
    noDispatches: language === 'hi' ? 'अभी तक कोई डिस्पैच दर्ज नहीं है।' : 'No dispatches logged yet.',
    loadingPreview: language === 'hi' ? 'पूर्वावलोकन लोड हो रहा है…' : 'Loading preview…',
    invoiceNoLabel: language === 'hi' ? 'इनवॉइस नंबर' : 'Invoice No',
    date: language === 'hi' ? 'तिथि' : 'Date',
    vehicleNo: language === 'hi' ? 'वाहन नंबर' : 'Vehicle No',
    transporter: language === 'hi' ? 'ट्रांसपोर्टर' : 'Transporter',
    description: language === 'hi' ? 'विवरण' : 'Description',
    totalSqmQty: language === 'hi' ? 'कुल SQM / मात्रा' : 'Total SQM / Qty',
    srNo: language === 'hi' ? 'क्र. सं.' : 'Sr. No',
    division: language === 'hi' ? 'डिवीजन' : 'Division',
    sqm: language === 'hi' ? 'एसक्यूएम' : 'SQM',
    costPerSqm: language === 'hi' ? 'लागत / SQM' : 'Cost / SQM',
    paginationShowing: language === 'hi' ? 'दिखाए जा रहे हैं' : 'Showing',
    paginationOf: language === 'hi' ? 'में से' : 'of',
    paginationPrevious: language === 'hi' ? 'पिछला' : 'Previous',
    paginationNext: language === 'hi' ? 'अगला' : 'Next',
    paginationPage: language === 'hi' ? 'पेज' : 'Page',
  };
  const { user, isLoading: userLoading } = useAuthUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessRole, setAccessRole] = useState('stock_maintainer');
  const [arrivalSubmitting, setArrivalSubmitting] = useState(false);
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [arrivalNotice, setArrivalNotice] = useState(null);
  const [dispatchNotice, setDispatchNotice] = useState(null);
  const [arrivalSearch, setArrivalSearch] = useState('');
  const [dispatchSearch, setDispatchSearch] = useState('');
  const [stockSearch, setStockSearch] = useState('');
  const [arrivalSort, setArrivalSort] = useState({ key: 'datetime', direction: 'desc' });
  const [dispatchSort, setDispatchSort] = useState({ key: 'datetime', direction: 'desc' });
  const [stockSort, setStockSort] = useState({ key: 'sku', direction: 'asc' });
  const [activeTableView, setActiveTableView] = useState('dispatches');
  const [processedDeepLink, setProcessedDeepLink] = useState('');
  const [highlightedShipmentKey, setHighlightedShipmentKey] = useState(null);
  const [arrivalExpandedId, setArrivalExpandedId] = useState(null);
  const [dispatchExpandedId, setDispatchExpandedId] = useState(null);
  const [stockPage, setStockPage] = useState(1);
  const [arrivalPage, setArrivalPage] = useState(1);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [previewItemsPage, setPreviewItemsPage] = useState(1);
  const [previewState, setPreviewState] = useState({
    open: false,
    loading: false,
    kind: null,
    title: '',
    description: '',
    record: null,
    items: [],
    documents: [],
    error: null,
  });
  const arrivalSheetOpen = useStockFormStore((state) => state.arrivalSheetOpen);
  const dispatchSheetOpen = useStockFormStore((state) => state.dispatchSheetOpen);
  const setArrivalSheetOpen = useStockFormStore((state) => state.setArrivalSheetOpen);
  const setDispatchSheetOpen = useStockFormStore((state) => state.setDispatchSheetOpen);
  const arrivalAttachments = useStockFormStore((state) => state.arrivalAttachments);
  const dispatchAttachments = useStockFormStore((state) => state.dispatchAttachments);
  const setArrivalAttachment = useStockFormStore((state) => state.setArrivalAttachment);
  const setDispatchAttachment = useStockFormStore((state) => state.setDispatchAttachment);
  const resetArrivalAttachments = useStockFormStore((state) => state.resetArrivalAttachments);
  const resetDispatchAttachments = useStockFormStore((state) => state.resetDispatchAttachments);
  const arrivalForm = useForm({
    resolver: zodResolver(arrivalFormSchema),
    defaultValues: createInitialArrivalDraft(),
  });
  const dispatchForm = useForm({
    resolver: zodResolver(dispatchFormSchema),
    defaultValues: createInitialDispatchDraft(),
  });
  const arrivalItemsFieldArray = useFieldArray({
    control: arrivalForm.control,
    name: 'items',
  });
  const dispatchItemsFieldArray = useFieldArray({
    control: dispatchForm.control,
    name: 'items',
  });
  const arrivalPaymentStatus = useWatch({ control: arrivalForm.control, name: 'paymentStatus' });
  const arrivalItems = useWatch({ control: arrivalForm.control, name: 'items' }) || [];

  async function refreshDashboard() {
    const json = await fetchDashboardData();
    setData(json);
    return json;
  }

  const canCreateArrival = accessRole !== 'salesperson';

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setError(null);
      try {
        const json = await fetchDashboardData();
        if (mounted) setData(json);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (userLoading) {
      return () => {
        mounted = false;
      };
    }

    if (!user) {
      setLoading(false);
      setError('Unauthorized');
      return () => {
        mounted = false;
      };
    }

    loadData();

    return () => { mounted = false; };
  }, [user, userLoading]);

  useEffect(() => {
    let mounted = true;

    async function loadAccessRole() {
      if (!user) {
        return;
      }

      try {
        const response = await fetch('/api/stock/access', { cache: 'no-store' });
        const json = await response.json();

        if (!mounted) {
          return;
        }

        if (response.ok) {
          setAccessRole(String(json.role || 'stock_maintainer'));
        }
      } catch {
        // Keep fallback role for UI-only gating if access lookup fails.
      }
    }

    loadAccessRole();

    return () => {
      mounted = false;
    };
  }, [user]);

  async function uploadShipmentDocument({ entityType, entityId, documentType, file, documentNumber, notes }) {
    if (!file) {
      return null;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('entityId', String(entityId));
    formData.append('documentType', documentType);
    if (documentNumber) {
      formData.append('documentNumber', documentNumber);
    }
    if (notes) {
      formData.append('notes', notes);
    }

    const response = await fetch('/api/stock/documents', {
      method: 'POST',
      body: formData,
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || json.detail || `Failed to upload ${documentType}`);
    }

    return json.document;
  }

  function closePreview() {
    setPreviewState((current) => ({ ...current, open: false }));
  }

  async function openShipmentPreview(kind, row) {
    const shipmentType = kind === 'arrival' ? 'inbound_shipment' : 'outbound_shipment';
    const endpoint = kind === 'arrival'
      ? `/api/stock/inbound-shipments/${row.id}`
      : `/api/stock/outbound-shipments/${row.id}`;
    setPreviewItemsPage(1);

    setPreviewState({
      open: true,
      loading: true,
      kind,
      title: `${kind === 'arrival' ? 'Purchase' : 'Dispatch'} ${row.shipment_number}`,
      description: 'Loading full shipment details…',
      record: row,
      items: [],
      documents: [],
      error: null,
    });

    try {
      const [shipmentResponse, documentsResponse] = await Promise.all([
        fetch(endpoint),
        fetch(`/api/stock/documents?entityType=${shipmentType}&entityId=${row.id}&limit=20`, { cache: 'no-store' }),
      ]);

      const shipmentJson = await shipmentResponse.json();
      const documentsJson = await documentsResponse.json();

      if (!shipmentResponse.ok) {
        throw new Error(shipmentJson.error || shipmentJson.detail || 'Failed to load shipment details');
      }

      if (!documentsResponse.ok) {
        throw new Error(documentsJson.error || documentsJson.detail || 'Failed to load shipment documents');
      }

      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Purchase' : 'Dispatch'} ${shipmentJson.shipment?.shipment_number || row.shipment_number}`,
        description: kind === 'arrival' ? 'Inbound purchase detail preview' : 'Outbound shipment detail preview',
        record: shipmentJson.shipment || row,
        items: shipmentJson.items || [],
        documents: documentsJson.documents || [],
        error: null,
      });
    } catch (error) {
      setPreviewState({
        open: true,
        loading: false,
        kind,
        title: `${kind === 'arrival' ? 'Purchase' : 'Dispatch'} ${row.shipment_number}`,
        description: 'Unable to load full details',
        record: row,
        items: [],
        documents: [],
        error: error.message,
      });
    }
  }

  async function openStockItemPreview(item) {
    setPreviewItemsPage(1);
    setPreviewState({
      open: true,
      loading: false,
      kind: 'stock',
      title: `${item.sku} • ${item.name}`,
      description: 'Current stock item details',
      record: item,
      items: [],
      documents: [],
      error: null,
    });
  }

  function autoPopulateArrivalItem(index, matchedItem) {
    const item = arrivalForm.getValues(`items.${index}`);
    arrivalForm.setValue(`items.${index}`, {
      ...item,
      itemId: String(matchedItem.id),
      itemName: matchedItem.name || item.itemName,
      sku: matchedItem.sku || item.sku,
      brandName: matchedItem.brand_name || item.brandName,
      divisionName: matchedItem.division_name || matchedItem.department || item.divisionName,
      typeName: matchedItem.type_name || item.typeName,
      sizeLabel: matchedItem.size_label || item.sizeLabel,
      sizeUnit: matchedItem.size_unit || item.sizeUnit || 'mm',
      thicknessMm: matchedItem.thickness_mm != null ? String(matchedItem.thickness_mm) : item.thicknessMm,
      tilesPerBox: matchedItem.tiles_per_box != null ? String(matchedItem.tiles_per_box) : item.tilesPerBox,
      piecesPerBox: matchedItem.pieces_per_box != null ? String(matchedItem.pieces_per_box) : item.piecesPerBox,
      reorderLevel: matchedItem.reorder_level != null ? String(matchedItem.reorder_level) : item.reorderLevel,
      description: matchedItem.description || item.description,
    }, { shouldDirty: true, shouldValidate: true });
  }

  function handleArrivalItemNameChange(index, value) {
    arrivalForm.setValue(`items.${index}.itemName`, value, { shouldDirty: true, shouldValidate: true });

    const matchedItem = findMatchingActiveItem(data?.activeItems, value);
    if (matchedItem) {
      autoPopulateArrivalItem(index, matchedItem);
      return;
    }

    arrivalForm.setValue(`items.${index}.itemId`, '', { shouldDirty: true, shouldValidate: true });
  }

  function handleArrivalItemSkuChange(index, value) {
    arrivalForm.setValue(`items.${index}.sku`, value, { shouldDirty: true, shouldValidate: true });

    const matchedItem = findMatchingActiveItem(data?.activeItems, value);
    if (matchedItem) {
      autoPopulateArrivalItem(index, matchedItem);
      return;
    }

    arrivalForm.setValue(`items.${index}.itemId`, '', { shouldDirty: true, shouldValidate: true });
  }

  function addArrivalItemRow() {
    arrivalItemsFieldArray.append(createArrivalItemRow());
  }

  function addDispatchItemRow() {
    dispatchItemsFieldArray.append(createDispatchItemRow());
  }

  function toggleSort(sortState, setSortState, key) {
    setSortState((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function getSortedRows(rows, sortState, accessors) {
    const sortedRows = [...rows];

    sortedRows.sort((left, right) => {
      const leftValue = accessors[sortState.key]?.(left);
      const rightValue = accessors[sortState.key]?.(right);

      if (leftValue === rightValue) {
        return 0;
      }

      if (leftValue == null) {
        return 1;
      }

      if (rightValue == null) {
        return -1;
      }

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return sortState.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
      }

      const comparison = String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
        sensitivity: 'base',
      });

      return sortState.direction === 'asc' ? comparison : -comparison;
    });

    return sortedRows;
  }

  async function handleArrivalSubmit(values) {
    setArrivalNotice(null);
    setArrivalSubmitting(true);

    if (!canCreateArrival) {
      setArrivalNotice({
        type: 'warning',
        message: 'Insufficient permission: salespeople can review stock and create dispatches, but cannot log new purchases.',
      });
      setArrivalSubmitting(false);
      return;
    }

    try {
      const items = values.items
        .map((item) => {
          const piecesPerBox = toNumber(item.piecesPerBox);
          const wholeQty = toNumber(item.wholeQty);
          const brokenQty = toNumber(item.brokenQty);
          const sizeSqm = parseSizeLabelSqm(item.sizeLabel);
          const sqmPerBox = sizeSqm && piecesPerBox > 0 ? sizeSqm * piecesPerBox : null;
          const inferredQtySqm = sqmPerBox != null ? round3((wholeQty + brokenQty) * sqmPerBox) : null;
          const qtySqm = item.qtySqm === '' ? inferredQtySqm : toNumber(item.qtySqm);
          const costPerSqm = item.costPerSqm === '' ? null : toNumber(item.costPerSqm);
          const unitPrice = costPerSqm != null && qtySqm != null ? Number((costPerSqm * qtySqm).toFixed(2)) : 0;

          return {
            itemId: trimText(item.itemId),
            sku: trimText(item.sku),
            itemName: trimText(item.itemName),
            brandName: trimText(item.brandName),
            divisionName: trimText(item.divisionName),
            typeName: trimText(item.typeName),
            sizeLabel: trimText(item.sizeLabel),
            sizeUnit: trimText(item.sizeUnit) || 'mm',
            hsnCode: trimText(item.hsnCode),
            thicknessMm: item.thicknessMm === '' ? null : toNumber(item.thicknessMm),
            tilesPerBox: toNumber(item.tilesPerBox),
            piecesPerBox,
            reorderLevel: toNumber(item.reorderLevel),
            description: trimText(item.description),
            wholeQty,
            brokenQty,
            qtySqm,
            costPerSqm,
            unitPrice,
            notes: trimText(item.notes),
          };
        })
        .filter((item) => item.itemId || item.itemName || item.wholeQty > 0 || item.brokenQty > 0 || item.notes);

      if (items.length === 0) {
        throw new Error('Add at least one purchase item.');
      }

      if (items.some((item) => !item.itemId && (!item.itemName || !item.brandName || !item.typeName || !item.sizeLabel))) {
        throw new Error('Pick an existing tile from autocomplete or enter tile name, brand, type, and size for a new tile.');
      }

      if (items.some((item) => item.wholeQty === 0 && item.brokenQty === 0)) {
        throw new Error('Enter whole or broken quantity for each purchase row.');
      }

      const response = await fetch('/api/stock/inbound-shipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          purchaseNumber: trimText(values.shipmentNumber) || undefined,
          purchaseDate: values.invoiceDate || undefined,
          shipmentNumber: trimText(values.shipmentNumber) || undefined,
          supplierName: trimText(values.supplierName) || undefined,
          truckLicensePlate: trimText(values.truckLicensePlate) || undefined,
          truckNumber: trimText(values.truckLicensePlate) || undefined,
          driverName: trimText(values.driverName) || undefined,
          invoiceNumber: trimText(values.invoiceNumber) || undefined,
          invoiceDate: values.invoiceDate || undefined,
          originCity: trimText(values.originCity) || undefined,
          destinationWarehouseName: trimText(values.destinationWarehouseName) || undefined,
          paymentStatus: trimText(values.paymentStatus) || 'unpaid',
          paidAmount: values.paidAmount === '' ? undefined : toNumber(values.paidAmount),
          paymentDate: values.paymentDate || undefined,
          paymentReference: trimText(values.paymentReference) || undefined,
          paymentMode: trimText(values.paymentMode) || undefined,
          deliveryCost: toNumber(values.transportCost),
          unloadingLabourCost: toNumber(values.laborCost),
          notes: trimText(values.notes) || undefined,
          items: items.map((item) => ({
            itemId: item.itemId ? Number(item.itemId) : undefined,
            sku: item.sku || undefined,
            itemName: item.itemName || undefined,
            brandName: item.brandName || undefined,
            divisionName: item.divisionName || undefined,
            department: item.divisionName || item.brandName || undefined,
            typeName: item.typeName || undefined,
            sizeLabel: item.sizeLabel || undefined,
            sizeUnit: item.sizeUnit || undefined,
            hsnCode: item.hsnCode || undefined,
            thicknessMm: item.thicknessMm ?? undefined,
            tilesPerBox: item.tilesPerBox || undefined,
            piecesPerBox: item.piecesPerBox || undefined,
            reorderLevel: item.reorderLevel || undefined,
            description: item.description || undefined,
            qtySqm: item.qtySqm ?? undefined,
            costPerSqm: item.costPerSqm ?? undefined,
            unitPrice: item.unitPrice || undefined,
            wholeQty: item.wholeQty,
            brokenQty: item.brokenQty,
            notes: item.notes || undefined,
          })),
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || json.detail || 'Failed to submit purchase');
      }

      arrivalForm.reset(createInitialArrivalDraft());
      resetArrivalAttachments();
      setArrivalSheetOpen(false);
      setArrivalNotice({
        type: 'success',
        message: `Purchase ${json.shipment?.shipment_number || 'submitted'} sent for review.`,
      });
      try {
        const linkedInvoice = await uploadShipmentDocument({
          entityType: 'inbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'purchase_invoice',
          file: arrivalAttachments.purchaseInvoice,
          documentNumber: trimText(values.invoiceNumber) || undefined,
          notes: trimText(values.notes) || undefined,
        });
        if (linkedInvoice) {
          setArrivalNotice({ type: 'success', message: `Purchase ${json.shipment?.shipment_number || 'submitted'} sent for review and invoice attached.` });
        }

        const linkedBill = await uploadShipmentDocument({
          entityType: 'inbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'transporter_bill',
          file: arrivalAttachments.transporterBill,
          documentNumber: trimText(values.invoiceNumber) || undefined,
          notes: trimText(values.notes) || undefined,
        });
        if (linkedBill) {
          setArrivalNotice({ type: 'success', message: `Purchase ${json.shipment?.shipment_number || 'submitted'} sent for review and documents attached.` });
        }
      } catch (uploadError) {
        setArrivalNotice({
          type: 'warning',
          message: `Purchase saved, but one or more document uploads failed: ${uploadError.message}`,
        });
      }

      try {
        await refreshDashboard();
      } catch (refreshError) {
        setArrivalNotice({
          type: 'warning',
          message: `Purchase saved, but dashboard refresh failed: ${refreshError.message}`,
        });
      }
    } catch (submitError) {
      setArrivalNotice({
        type: 'error',
        message: submitError.message,
      });
    } finally {
      setArrivalSubmitting(false);
    }
  }

  async function handleDispatchSubmit(values) {
    setDispatchNotice(null);
    setDispatchSubmitting(true);

    try {
      const customerName = trimText(values.customerName);
      if (!customerName) {
        throw new Error('Customer name is required.');
      }

      const items = values.items
        .map((item) => ({
          itemId: trimText(item.itemId),
          loadedWholeQty: toNumber(item.loadedWholeQty),
          loadedBrokenQty: toNumber(item.loadedBrokenQty),
          notes: trimText(item.notes),
        }))
        .filter((item) => item.itemId || item.loadedWholeQty > 0 || item.loadedBrokenQty > 0 || item.notes);

      if (items.length === 0) {
        throw new Error('Add at least one dispatch item.');
      }

      if (items.some((item) => !item.itemId)) {
        throw new Error('Select a stock item for each dispatch row.');
      }

      if (items.some((item) => item.loadedWholeQty === 0 && item.loadedBrokenQty === 0)) {
        throw new Error('Enter whole or broken quantity for each dispatch row.');
      }

      const response = await fetch('/api/stock/outbound-shipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shipmentNumber: trimText(values.shipmentNumber) || undefined,
          customerName,
          truckLicensePlate: trimText(values.truckLicensePlate) || undefined,
          truckNumber: trimText(values.truckLicensePlate) || undefined,
          driverName: trimText(values.driverName) || undefined,
          invoiceNumber: trimText(values.invoiceNumber) || undefined,
          salespersonName: trimText(values.salespersonName) || undefined,
          dispatchDate: values.dispatchDate || undefined,
          transportCost: toNumber(values.transportCost),
          loadingLabourCost: toNumber(values.laborCost),
          notes: trimText(values.notes) || undefined,
          items: items.map((item) => ({
            itemId: Number(item.itemId),
            loadedWholeQty: item.loadedWholeQty,
            loadedBrokenQty: item.loadedBrokenQty,
            notes: item.notes || undefined,
          })),
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || json.detail || 'Failed to submit dispatch');
      }

      dispatchForm.reset(createInitialDispatchDraft());
      resetDispatchAttachments();
      setDispatchSheetOpen(false);
      setDispatchNotice({
        type: 'success',
        message: `Dispatch ${json.shipment?.shipment_number || 'submitted'} sent for review.`,
      });

      try {
        await uploadShipmentDocument({
          entityType: 'outbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'sales_invoice',
          file: dispatchAttachments.salesInvoice,
          documentNumber: trimText(values.invoiceNumber) || undefined,
          notes: trimText(values.notes) || undefined,
        });

        await uploadShipmentDocument({
          entityType: 'outbound_shipment',
          entityId: json.shipment?.id,
          documentType: 'gatepass',
          file: dispatchAttachments.gatepass,
          documentNumber: trimText(values.shipmentNumber) || undefined,
          notes: trimText(values.notes) || undefined,
        });
      } catch (uploadError) {
        setDispatchNotice({
          type: 'warning',
          message: `Dispatch saved, but one or more document uploads failed: ${uploadError.message}`,
        });
      }

      try {
        await refreshDashboard();
      } catch (refreshError) {
        setDispatchNotice({
          type: 'warning',
          message: `Dispatch saved, but dashboard refresh failed: ${refreshError.message}`,
        });
      }
    } catch (submitError) {
      setDispatchNotice({
        type: 'error',
        message: submitError.message,
      });
    } finally {
      setDispatchSubmitting(false);
    }
  }

  function handleArrivalInvalid() {
    setArrivalNotice({
      type: 'error',
      message: 'Please fix the highlighted purchase fields and try again.',
    });
  }

  function handleDispatchInvalid() {
    setDispatchNotice({
      type: 'error',
      message: 'Please fix the highlighted dispatch fields and try again.',
    });
  }

  const tableViewTabs = [
    { id: 'dispatches', label: t('dispatches') },
    { id: 'purchases', label: t('purchases') },
    { id: 'items', label: t('currentStock') },
  ];

  const purchaseSourceRows = data?.recentPurchases || data?.recentArrivals || [];

  const arrivalRows = getSortedRows(
    purchaseSourceRows.filter((shipment) => {
      const query = normalizeSearchValue(arrivalSearch);
      if (!query) {
        return true;
      }

      return [
        shipment.shipment_number,
        shipment.status,
        shipment.generated_by,
        shipment.approved_by,
        formatDateTime(shipment.arrival_date),
        shipment.truck_license_plate,
        shipment.driver_name,
        shipment.product_names,
        shipment.product_skus,
        shipment.total_whole_qty,
        shipment.total_broken_qty,
      ].some((value) => matchesQuery(value, query));
    }),
    arrivalSort,
    {
      datetime: (shipment) => new Date(shipment.arrival_date || shipment.created_at || 0).getTime(),
      shipment: (shipment) => shipment.shipment_number || '',
      products: (shipment) => shipment.product_names || '',
      quantities: (shipment) => Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0),
      status: (shipment) => shipment.status || '',
    }
  );

  const dispatchRows = getSortedRows(
    (data?.recentDispatches || []).filter((shipment) => {
      const query = normalizeSearchValue(dispatchSearch);
      if (!query) {
        return true;
      }

      return [
        shipment.shipment_number,
        shipment.status,
        shipment.generated_by,
        shipment.approved_by,
        formatDateTime(shipment.dispatch_date),
        shipment.truck_license_plate,
        shipment.driver_name,
        shipment.product_names,
        shipment.product_skus,
        shipment.total_whole_qty,
        shipment.total_broken_qty,
      ].some((value) => matchesQuery(value, query));
    }),
    dispatchSort,
    {
      datetime: (shipment) => new Date(shipment.dispatch_date || shipment.created_at || 0).getTime(),
      shipment: (shipment) => shipment.shipment_number || '',
      products: (shipment) => shipment.product_names || '',
      quantities: (shipment) => Number(shipment.total_whole_qty || 0) + Number(shipment.total_broken_qty || 0),
      status: (shipment) => shipment.status || '',
    }
  );

  const stockRows = getSortedRows(
    (data?.activeItems || []).filter((item) => {
      const query = normalizeSearchValue(stockSearch);
      if (!query) {
        return true;
      }

      return [item.sku, item.name, item.size_label, item.current_whole_qty, item.current_broken_qty, item.reorder_level]
        .some((value) => matchesQuery(value, query));
    }),
    stockSort,
    {
      sku: (item) => item.sku || '',
      name: (item) => item.name || '',
      size: (item) => item.size_label || '',
      whole: (item) => Number(item.current_whole_qty || 0),
      broken: (item) => Number(item.current_broken_qty || 0),
      reorder: (item) => Number(item.reorder_level || 0),
    }
  );

  const stockPagination = paginateRows(stockRows, stockPage, DEFAULT_PAGE_SIZE);
  const arrivalPagination = paginateRows(arrivalRows, arrivalPage, DEFAULT_PAGE_SIZE);
  const dispatchPagination = paginateRows(dispatchRows, dispatchPage, DEFAULT_PAGE_SIZE);
  const previewItemPagination = paginateRows(previewState.items || [], previewItemsPage, DEFAULT_PAGE_SIZE);
  const isInboundPreview = previewState.kind === 'arrival';
  const inboundMetaItems = [
    { label: 'Status', value: previewState.record?.status },
    { label: 'Approval', value: previewState.record?.approval_status },
    { label: 'Datetime', value: formatDateTime(previewState.record?.arrival_date || previewState.record?.created_at) },
    { label: 'Driver', value: previewState.record?.driver_name },
    { label: 'Origin City', value: previewState.record?.origin_city },
    { label: 'Destination Warehouse', value: previewState.record?.destination_warehouse_name },
    { label: 'Payment Status', value: previewState.record?.payment_status },
    { label: 'Paid Amount', value: previewState.record?.paid_amount },
    { label: 'Payment Date', value: previewState.record?.payment_date },
    { label: 'Payment Ref', value: previewState.record?.payment_reference || previewState.record?.payment_mode },
    { label: 'Total Whole', value: previewState.record?.total_whole_qty },
    { label: 'Total Broken', value: previewState.record?.total_broken_qty },
    { label: 'Notes', value: previewState.record?.notes },
  ];
  const hasTechnicalSubBar = Boolean(previewState.record?.eway_bill_number || previewState.record?.irn_number);

  useEffect(() => {
    setStockPage((current) => Math.min(current, stockPagination.pageCount));
  }, [stockPagination.pageCount]);

  useEffect(() => {
    setArrivalPage((current) => Math.min(current, arrivalPagination.pageCount));
  }, [arrivalPagination.pageCount]);

  useEffect(() => {
    setDispatchPage((current) => Math.min(current, dispatchPagination.pageCount));
  }, [dispatchPagination.pageCount]);

  useEffect(() => {
    setPreviewItemsPage((current) => Math.min(current, previewItemPagination.pageCount));
  }, [previewItemPagination.pageCount]);

  useEffect(() => {
    if (!data) {
      return;
    }

    const view = searchParams.get('view');
    const entityType = searchParams.get('entityType');
    const entityIdRaw = searchParams.get('entityId');
    const entityId = Number(entityIdRaw);

    if (view === 'items' || view === 'arrivals' || view === 'purchases' || view === 'dispatches') {
      setActiveTableView(view === 'arrivals' ? 'purchases' : view);
    }

    if (!entityType || !entityId || Number.isNaN(entityId)) {
      return;
    }

    const deepLinkKey = `${entityType}:${entityId}`;
    if (processedDeepLink === deepLinkKey) {
      return;
    }

    if (entityType === 'inbound_shipment') {
      const target = (data.recentPurchases || data.recentArrivals || []).find((item) => Number(item.id) === entityId);
      setActiveTableView('purchases');
      setHighlightedShipmentKey(`arrival-${entityId}`);
      openShipmentPreview('arrival', target || { id: entityId, shipment_number: `INB-${entityId}` });
      setProcessedDeepLink(deepLinkKey);
      return;
    }

    if (entityType === 'outbound_shipment') {
      const target = (data.recentDispatches || []).find((item) => Number(item.id) === entityId);
      setActiveTableView('dispatches');
      setHighlightedShipmentKey(`dispatch-${entityId}`);
      openShipmentPreview('dispatch', target || { id: entityId, shipment_number: `OUT-${entityId}` });
      setProcessedDeepLink(deepLinkKey);
    }
  }, [data, processedDeepLink, searchParams]);

  useEffect(() => {
    const requestedNewForm = searchParams.get('new');
    if (!requestedNewForm) {
      return;
    }

    if (requestedNewForm === 'purchase') {
      setActiveTableView('purchases');
      setDispatchSheetOpen(false);
      setArrivalSheetOpen(true);
    } else if (requestedNewForm === 'dispatch') {
      setActiveTableView('dispatches');
      setArrivalSheetOpen(false);
      setDispatchSheetOpen(true);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const nextQuery = params.toString();
    router.replace(nextQuery ? `/stock?${nextQuery}` : '/stock');
  }, [router, searchParams]);

  useEffect(() => {
    if (!highlightedShipmentKey) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setHighlightedShipmentKey(null);
    }, 4000);

    return () => clearTimeout(timeoutId);
  }, [highlightedShipmentKey]);

  const totalWholeStock = (data?.activeItems || []).reduce((sum, item) => sum + Number(item.current_whole_qty || 0), 0);
  const totalBrokenStock = (data?.activeItems || []).reduce((sum, item) => sum + Number(item.current_broken_qty || 0), 0);
  const totalStockUnits = totalWholeStock + totalBrokenStock;
  const pendingArrivals = (data?.recentPurchases || data?.recentArrivals || []).filter((item) => String(item.status || '').toLowerCase().includes('pending')).length;
  const pendingDispatches = (data?.recentDispatches || []).filter((item) => String(item.status || '').toLowerCase().includes('pending')).length;
  const riskItems = (data?.activeItems || []).filter((item) => Number(item.reorder_level || 0) > 0 && (Number(item.current_whole_qty || 0) + Number(item.current_broken_qty || 0)) <= Number(item.reorder_level || 0)).length;

  const stockStats = [
    {
      label: 'Total Stock',
      value: totalStockUnits,
      trend: totalStockUnits ? Math.round((totalWholeStock / totalStockUnits) * 100) : 0,
      trendLabel: 'Whole ratio',
      icon: Boxes,
      accent: 'from-[#E07A00]/20 to-[#E07A00]/5',
    },
    {
      label: 'Pending Purchases',
      value: pendingArrivals,
      trend: pendingArrivals === 0 ? 100 : -Math.min(pendingArrivals * 10, 100),
      trendLabel: 'Queue health',
      icon: PackageCheck,
      accent: 'from-[#1A1A54]/25 to-[#1A1A54]/10',
    },
    {
      label: 'Pending Dispatches',
      value: pendingDispatches,
      trend: pendingDispatches === 0 ? 100 : -Math.min(pendingDispatches * 10, 100),
      trendLabel: 'Dispatch readiness',
      icon: BarChart3,
      accent: 'from-[#F59E0B]/25 to-[#F59E0B]/10',
    },
    {
      label: 'Reorder Risks',
      value: riskItems,
      trend: riskItems === 0 ? 100 : -Math.min(riskItems * 12, 100),
      trendLabel: 'Safety score',
      icon: CircleAlert,
      accent: 'from-[#1A1A54]/20 to-[#E07A00]/15',
    },
  ];

  if (loading) {
    return (
      <div className={CLASSES.contentWrap}>
        <div className={CLASSES.statGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`stock-stat-skeleton-${index}`} className="h-32 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className={CLASSES.contentWrap}>
      <div className={CLASSES.topCard}>
        <h1 className="text-lg font-semibold text-foreground">{tc.stockOperations}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tc.stockSubtitle}</p>
      </div>

      <div className={CLASSES.statGrid}>
        {stockStats.map((stat) => {
          const Icon = stat.icon;
          const isPositive = stat.trend >= 0;

          return (
            <div key={stat.label} className={CLASSES.statCard}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className={`${CLASSES.statLabel} truncate`}>{stat.label}</p>
                  <p className={`${CLASSES.statValue} font-mono`}>{stat.value}</p>
                </div>
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.accent} text-slate-700 dark:text-slate-100`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{stat.trendLabel}</span>
                <Badge variant={isPositive ? 'approved' : 'rejected'}>{isPositive ? '+' : ''}{stat.trend}%</Badge>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200/60 bg-white p-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tableViewTabs.map((tab) => {
            const isActive = activeTableView === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTableView(tab.id)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${isActive
                  ? 'bg-primary text-primary-foreground shadow-sm duration-300'
                  : 'text-muted-foreground duration-300 hover:bg-muted/80 hover:text-foreground'
                  }`}
                aria-label={`Switch to ${tab.label}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {activeTableView === 'items' && (
        <div className="stock-tab-panel" key="stock-panel-items">
          <div id="current-stock" className="overflow-hidden scroll-mt-6 rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <h2 className="text-base font-semibold text-foreground">{t('currentStock')}</h2>
              <span className="text-xs text-muted-foreground">{data?.activeItems?.length || 0} {t('items')}</span>
            </div>
            <div className="border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <input
                type="search"
                value={stockSearch}
                onChange={(event) => setStockSearch(event.target.value)}
                placeholder={tc.searchItems}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="sticky top-0 bg-slate-50/90 font-medium text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'sku')} className="font-medium hover:text-foreground">
                        {t('sku')}
                      </button>
                    </th>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'name')} className="font-medium hover:text-foreground">
                        {t('name')}
                      </button>
                    </th>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'size')} className="font-medium hover:text-foreground">
                        {t('size')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'whole')} className="font-medium hover:text-foreground">
                        {t('whole')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'broken')} className="font-medium hover:text-foreground">
                        {t('broken')}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" onClick={() => toggleSort(stockSort, setStockSort, 'reorder')} className="font-medium hover:text-foreground">
                        {t('reorder')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stockPagination.rows.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer bg-white transition hover:bg-slate-50 focus-within:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/40 dark:focus-within:bg-slate-800/40"
                      onClick={() => openStockItemPreview(item)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openStockItemPreview(item);
                        }
                      }}
                      title="Click to preview"
                    >
                      <td className="border-r border-slate-100 px-3 py-2 font-mono font-medium text-foreground dark:border-slate-800">{item.sku}</td>
                      <td className="px-3 py-2 truncate max-w-[200px]" title={item.name}>{item.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.size_label}</td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground">{item.current_whole_qty}</td>
                      <td className="px-3 py-2 text-right text-amber-600">{item.current_broken_qty}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{item.reorder_level}</td>
                    </tr>
                  ))}
                  {stockPagination.total === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-3 py-10">
                        <div className="flex flex-col items-center justify-center gap-3 text-center">
                          <Boxes className="h-6 w-6 text-slate-400" />
                          <p className="text-sm text-slate-500 dark:text-slate-400">{tc.noStockItems}</p>
                          <button
                            type="button"
                            onClick={() => setStockSearch('')}
                            className="rounded-xl bg-[#E07A00] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#c96d00] focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20"
                          >
                            {tc.resetSearch}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={stockPagination.page}
              pageCount={stockPagination.pageCount}
              total={stockPagination.total}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setStockPage}
              labels={{
                showing: tc.paginationShowing,
                of: tc.paginationOf,
                previous: tc.paginationPrevious,
                next: tc.paginationNext,
                page: tc.paginationPage,
              }}
            />
          </div>
        </div>
      )}
      {activeTableView === 'purchases' && (
        <div className="stock-tab-panel" key="stock-panel-purchases">
          <section id="purchases" className="flex h-full flex-col overflow-hidden scroll-mt-6 rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <h2 className="text-base font-semibold text-foreground">{tc.purchases}</h2>
              <Sheet open={arrivalSheetOpen} onOpenChange={setArrivalSheetOpen}>
                <button
                  type="button"
                  onClick={() => {
                    setArrivalNotice(null);
                    setArrivalSheetOpen(true);
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={!canCreateArrival}
                  title={!canCreateArrival ? tc.insufficientNewPurchase : undefined}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {tc.newPurchase}
                  </span>
                </button>
                <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[50vw]">
                  <SheetHeader>
                    <SheetTitle>{tc.logNewPurchase}</SheetTitle>
                    <SheetDescription>{tc.purchaseSheetDesc}</SheetDescription>
                  </SheetHeader>
                  <Form {...arrivalForm}>
                    <form className="mt-6 space-y-5" onSubmit={arrivalForm.handleSubmit(handleArrivalSubmit, handleArrivalInvalid)}>
                      <InlineNotice notice={arrivalNotice} />
                      <div className={FORM_CARD_CLASS}>
                        <FormSectionTitle icon={FileText} title={tc.purchaseBasics} description={tc.purchaseBasicsDesc} />
                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                          <StockFormField control={arrivalForm.control} name="shipmentNumber" label={t('shipmentNo')} placeholder="SHP-202X..." autoFocus />
                          <StockFormField control={arrivalForm.control} name="supplierName" label={t('supplier')} placeholder="Supplier Name..." />
                        </div>
                      </div>
                      <div className={FORM_CARD_CLASS}>
                        <FormSectionTitle icon={Truck} title={tc.transportInvoice} />
                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                          <StockFormField control={arrivalForm.control} name="truckLicensePlate" label={t('truck')} placeholder="RJ 14 XY 0000" />
                          <StockFormField control={arrivalForm.control} name="driverName" label={t('driver')} placeholder="Driver Name..." />
                          <StockFormField control={arrivalForm.control} name="invoiceNumber" label={t('invoiceNo')} placeholder="INV-..." />
                          <StockDateField control={arrivalForm.control} name="invoiceDate" label={tc.invoiceDate} placeholder={tc.invoiceDate} />
                          <StockFormField control={arrivalForm.control} name="originCity" label={tc.originCity} placeholder="Source city" />
                          <StockFormField control={arrivalForm.control} name="destinationWarehouseName" label={tc.destinationWarehouse} placeholder="Warehouse name" />
                          <AttachmentField
                            label={tc.invoicePhoto}
                            file={arrivalAttachments.purchaseInvoice}
                            onChange={(file) => setArrivalAttachment('purchaseInvoice', file)}
                            hint={tc.invoicePhotoHint}
                          />
                          <AttachmentField
                            label={tc.transporterBillPhoto}
                            file={arrivalAttachments.transporterBill}
                            onChange={(file) => setArrivalAttachment('transporterBill', file)}
                            accept="image/*"
                            hint={tc.transporterBillHint}
                          />
                          <StockMoneyField control={arrivalForm.control} name="transportCost" label={t('transportCost')} hint={tc.amountInInr} />
                        </div>
                      </div>
                      <div className={FORM_CARD_CLASS}>
                        <FormSectionTitle icon={CreditCard} title={tc.paymentStatus} description={language === 'hi' ? 'भुगतान और सहायक विवरण दर्ज करें।' : 'Capture payment state and supporting details.'} />
                        <div className="grid pt-4 gap-4 md:grid-cols-2">
                          <FormField
                            control={arrivalForm.control}
                            name="paymentStatus"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className={FORM_LABEL_CLASS}>{tc.paymentStatus}</FormLabel>
                                <FormControl>
                                  <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger className={FORM_INPUT_CLASS}>
                                      <SelectValue placeholder={tc.paymentStatus} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unpaid">{tc.unpaid}</SelectItem>
                                      <SelectItem value="partial">{tc.partial}</SelectItem>
                                      <SelectItem value="paid">{tc.paid}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                          {(arrivalPaymentStatus === 'partial' || arrivalPaymentStatus === 'paid') ? (
                            <>
                              <StockMoneyField control={arrivalForm.control} name="paidAmount" label={tc.paidAmount} />
                              <StockDateField control={arrivalForm.control} name="paymentDate" label={tc.paymentDate} placeholder={tc.paymentDate} />
                              <StockFormField control={arrivalForm.control} name="paymentMode" label={tc.paymentMode} placeholder="NEFT / UPI / Cash" />
                              <StockFormField control={arrivalForm.control} name="paymentReference" label={tc.paymentReference} placeholder="Txn reference" />
                            </>
                          ) : null}
                          <StockMoneyField control={arrivalForm.control} name="laborCost" label={t('laborCost')} hint={tc.amountInInr} />
                        </div>
                      </div>
                      <div className="rounded-2xl bg-muted/20 p-0">
                        <div className="flex justify-between items-center mb-2 gap-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Boxes className="h-4 w-4 text-primary" />
                            <label>{t('items')}</label>
                          </div>
                          <button
                            type="button"
                            onClick={addArrivalItemRow}
                            className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Plus className="h-3.5 w-3.5" />
                              {t('addItem')}
                            </span>
                          </button>
                        </div>
                        <datalist id="arrival-item-options">
                          {(data?.activeItems || []).map((stockItem) => (
                            <option key={`arrival-option-${stockItem.id}`} value={stockItem.name}>
                              {stockItem.sku}
                            </option>
                          ))}
                        </datalist>
                        <div className="space-y-3">
                          {arrivalItemsFieldArray.fields.map((fieldRow, index) => {
                            const item = arrivalItems[index] || fieldRow;
                            const isCatalogItem = Boolean(item?.itemId);

                            return (
                              <div key={fieldRow.id} className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
                                {/* Item header */}
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-2.5">
                                  <span className="text-xs font-semibold text-foreground">{tc.itemLabel} {index + 1}</span>
                                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${isCatalogItem ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400'}`}>
                                    {isCatalogItem ? tc.autofilledCatalog : tc.newTileEntry}
                                  </span>
                                </div>
                                <div className="p-4 space-y-4">
                                  {/* Tile name + qty row */}
                                  <div className="grid gap-3 grid-cols-[minmax(0,1fr)_120px_120px]">
                                    <div>
                                      <label className={FORM_LABEL_CLASS}>{language === 'hi' ? 'टाइल नाम' : 'Tile Name'}</label>
                                      <FormField
                                        control={arrivalForm.control}
                                        name={`items.${index}.itemName`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormControl>
                                              <Input
                                                {...field}
                                                value={field.value ?? ''}
                                                onChange={(event) => handleArrivalItemNameChange(index, event.target.value)}
                                                className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                placeholder={tc.typeTileName}
                                                list="arrival-item-options"
                                              />
                                            </FormControl>
                                            <div className="mt-1 text-[11px] text-muted-foreground">{tc.itemAutofillHint}</div>
                                            <FormMessage className="text-xs" />
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                    <FormField
                                      control={arrivalForm.control}
                                      name={`items.${index}.wholeQty`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className={FORM_LABEL_CLASS}>{tc.wholeBox}</FormLabel>
                                          <FormControl>
                                            <Input {...field} value={field.value ?? ''} type="number" min="0" placeholder="0" className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                          </FormControl>
                                          <FormMessage className="text-xs" />
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={arrivalForm.control}
                                      name={`items.${index}.brokenQty`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel className={FORM_LABEL_CLASS}>{tc.brokenTiles}</FormLabel>
                                          <FormControl>
                                            <Input {...field} value={field.value ?? ''} type="number" min="0" placeholder="0" className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                          </FormControl>
                                          <FormMessage className="text-xs" />
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                  {/* New tile detail section */}
                                  <div>
                                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-foreground/70">
                                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                                      {isCatalogItem ? 'Catalog Details' : 'New Tile Details'}
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.brandName`} label="Brand" placeholder="Brand" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" disabled={isCatalogItem} />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.divisionName`} label="Division" placeholder="Division" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.typeName`} label="Type" placeholder="Type" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" disabled={isCatalogItem} />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.sizeLabel`} label="Size" placeholder="800x800" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" disabled={isCatalogItem} />
                                      <FormField
                                        control={arrivalForm.control}
                                        name={`items.${index}.sku`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel className={FORM_LABEL_CLASS}>SKU</FormLabel>
                                            <FormControl>
                                              <Input
                                                {...field}
                                                value={field.value ?? ''}
                                                onChange={(event) => handleArrivalItemSkuChange(index, event.target.value)}
                                                className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                                placeholder="SKU optional"
                                              />
                                            </FormControl>
                                            <FormMessage className="text-xs" />
                                          </FormItem>
                                        )}
                                      />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.tilesPerBox`} label="Tiles / Box" type="number" placeholder="2" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" min="0" disabled={isCatalogItem} />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.piecesPerBox`} label="Pieces / Box" type="number" placeholder="2" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" min="0" disabled={isCatalogItem} />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.reorderLevel`} label="Reorder Level" type="number" placeholder="20" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" min="0" disabled={isCatalogItem} />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.sizeUnit`} label="Size Unit" placeholder="mm" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" disabled={isCatalogItem} />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.hsnCode`} label="HSN Code" placeholder="HSN Code" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.thicknessMm`} label="Thickness (mm)" type="number" placeholder="Thickness (mm)" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" min="0" step="0.01" />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.qtySqm`} label="Quantity (sqm)" type="number" placeholder="Quantity (sqm)" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" min="0" step="0.001" />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.costPerSqm`} label="Cost / sqm" type="number" placeholder="Cost / sqm" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" min="0" step="0.01" />
                                      <StockFormField control={arrivalForm.control} name={`items.${index}.description`} label="Description" placeholder="Description" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 lg:col-span-2" disabled={isCatalogItem} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className={FORM_CARD_CLASS}>
                        <FormField
                          control={arrivalForm.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={FORM_LABEL_CLASS}>{t('notes')}</FormLabel>
                              <FormControl>
                                <Textarea {...field} value={field.value ?? ''} className={FORM_INPUT_CLASS} rows={2} />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={arrivalSubmitting}
                        className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="inline-flex items-center gap-2">
                          <ReceiptText className="h-4 w-4" />
                          {arrivalSubmitting ? tc.submitting : (language === 'hi' ? 'खरीद जमा करें' : 'Submit Purchase')}
                        </span>
                      </button>
                    </form>
                  </Form>
                </SheetContent>
              </Sheet>
            </div>
            {!canCreateArrival ? (
              <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Insufficient permission: salespeople can create dispatches but cannot create purchases.
              </div>
            ) : null}
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <input
                type="search"
                value={arrivalSearch}
                onChange={(event) => setArrivalSearch(event.target.value)}
                placeholder="Search purchases by date, product, qty, truck, or status"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-3 p-3 md:hidden">
              {arrivalPagination.rows.map((a) => {
                const expanded = arrivalExpandedId === a.id;
                return (
                  <article key={`arrival-mobile-${a.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openShipmentPreview('arrival', a)}
                        className="min-w-0 flex-1 text-left"
                        aria-label={`Open purchase ${a.shipment_number}`}
                      >
                        <p className="break-all font-mono text-xs font-semibold text-primary">{a.shipment_number}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(a.arrival_date || a.created_at)}</p>
                      </button>
                      <Badge variant={getStatusVariant(a.status)}>{a.status}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{Number(a.total_whole_qty || 0)} whole / {Number(a.total_broken_qty || 0)} broken</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Invoice: {a.invoice_number || '—'} {a.invoice_date ? `(${formatDateTime(a.invoice_date)})` : ''}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {a.origin_city || '—'} to {a.destination_warehouse_name || '—'} • {a.payment_status || 'unpaid'}
                    </p>
                    {expanded ? (
                      <div className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <p className="truncate">{a.product_names || a.product_skus || '—'}</p>
                        <p>Division: {a.divisions || 'General'}</p>
                        <p>SQM: {Number(a.total_qty_sqm || 0).toFixed(3)} • Avg cost/sqm: {Number(a.avg_cost_per_sqm || 0).toFixed(2)}</p>
                        <p>By: {a.generated_by || '—'}</p>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setArrivalExpandedId((current) => (current === a.id ? null : a.id))}
                      className="mt-2 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      aria-label={expanded ? 'Collapse purchase details' : 'Expand purchase details'}
                    >
                      {expanded ? 'Collapse' : 'Expand'}
                    </button>
                  </article>
                );
              })}
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="hidden w-full text-xs text-left whitespace-nowrap md:table">
                <thead className="sticky top-0 bg-slate-50/90 font-medium text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'datetime')} className="font-medium hover:text-foreground">
                        {tc.datetime}
                      </button>
                    </th>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'shipment')} className="font-medium hover:text-foreground">
                        {t('shipmentNo')}
                      </button>
                    </th>
                    <th className="px-3 py-2">{tc.invoice}</th>
                    <th className="px-3 py-2">{tc.route}</th>
                    <th className="px-3 py-2">{tc.payment}</th>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'products')} className="font-medium hover:text-foreground">
                        Products
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'quantities')} className="font-medium hover:text-foreground">
                        Quantities
                      </button>
                    </th>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => toggleSort(arrivalSort, setArrivalSort, 'status')} className="font-medium hover:text-foreground">
                        {t('status')}
                      </button>
                    </th>
                    <th className="px-3 py-2">{tc.generatedBy}</th>
                    <th className="px-3 py-2">{tc.approvedBy}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {arrivalPagination.rows.map((a) => (
                    <tr
                      key={a.id}
                      className={`cursor-pointer transition hover:bg-slate-50 focus-within:bg-slate-50 dark:hover:bg-slate-800/40 dark:focus-within:bg-slate-800/40 ${highlightedShipmentKey === `arrival-${a.id}` ? 'bg-[#E07A00]/10 ring-1 ring-[#E07A00]/40' : 'odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70'
                        }`}
                      onClick={() => openShipmentPreview('arrival', a)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openShipmentPreview('arrival', a);
                        }
                      }}
                      title="Click to preview"
                    >
                      <td className="px-3 py-2 text-muted-foreground">{formatDateTime(a.arrival_date || a.created_at)}</td>
                      <td className="px-3 py-2 font-mono font-medium text-primary">{a.shipment_number}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div>{a.invoice_number || '—'}</div>
                        <div className="text-[10px]">{a.invoice_date ? formatDateTime(a.invoice_date) : '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div className="max-w-[170px] truncate" title={`${a.origin_city || '—'} to ${a.destination_warehouse_name || '—'}`}>
                          {a.origin_city || '—'} to {a.destination_warehouse_name || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div className="uppercase text-[10px] font-semibold">{a.payment_status || 'unpaid'}</div>
                        {a.paid_amount != null ? <div className="text-[10px]">INR {Number(a.paid_amount).toFixed(2)}</div> : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="max-w-[260px] truncate" title={a.product_names || a.product_skus || ''}>
                          {a.product_names || a.product_skus || '—'}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{a.divisions || 'General'}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {Number(a.total_whole_qty || 0)} whole / {Number(a.total_broken_qty || 0)} broken
                        <div className="text-[10px] text-muted-foreground">{Number(a.total_qty_sqm || 0).toFixed(3)} sqm</div>
                      </td>
                      <td className="px-3 py-2"><Badge variant={getStatusVariant(a.status)}>{a.status}</Badge></td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span>{a.generated_by || '—'}</span>
                          <Badge variant="neutral" className="text-[10px]">{getGeneratedByRoleLabel(a.generated_by_role)}</Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{a.approved_by || '—'}</td>
                    </tr>
                  ))}
                  {arrivalPagination.total === 0 ? (
                    <tr>
                      <td colSpan="10" className="px-3 py-10">
                        <div className="flex flex-col items-center justify-center gap-3 text-center">
                          <PackageCheck className="h-6 w-6 text-slate-400" />
                          <p className="text-sm text-slate-500 dark:text-slate-400">{tc.noPurchases}</p>
                          <button
                            type="button"
                            onClick={() => setArrivalSearch('')}
                            className="rounded-xl bg-[#E07A00] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#c96d00] focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20"
                          >
                            {tc.clearFilters}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={arrivalPagination.page}
              pageCount={arrivalPagination.pageCount}
              total={arrivalPagination.total}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setArrivalPage}
              labels={{
                showing: tc.paginationShowing,
                of: tc.paginationOf,
                previous: tc.paginationPrevious,
                next: tc.paginationNext,
                page: tc.paginationPage,
              }}
            />
          </section>
        </div>
      )}

      {activeTableView === 'dispatches' && (
        <div className="stock-tab-panel" key="stock-panel-dispatches">
          <section id="dispatches" className="flex h-full flex-col overflow-hidden scroll-mt-6 rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <h2 className="text-base font-semibold text-foreground">{t('dispatches')}</h2>
              <Sheet open={dispatchSheetOpen} onOpenChange={setDispatchSheetOpen}>
                <button
                  type="button"
                  onClick={() => {
                    setDispatchNotice(null);
                    setDispatchSheetOpen(true);
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {t('newDispatch')}
                  </span>
                </button>
                <SheetContent side="right" className="w-full max-w-none overflow-y-auto bg-white dark:bg-slate-950 md:w-[50vw]">
                  <SheetHeader className="border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Send className="h-5 w-5" />
                      </div>
                      <div>
                        <SheetTitle className="text-base">{t('logNewDispatch')}</SheetTitle>
                        <SheetDescription className="text-xs">{t('logNewDispatchDesc')}</SheetDescription>
                      </div>
                    </div>
                  </SheetHeader>
                  <Form {...dispatchForm}>
                    <form className="mt-5 space-y-4" onSubmit={dispatchForm.handleSubmit(handleDispatchSubmit, handleDispatchInvalid)}>
                      <InlineNotice notice={dispatchNotice} />
                      {/* Dispatch basics */}
                      <div className={FORM_CARD_CLASS}>
                        <FormSectionTitle icon={Send} title={language === 'hi' ? 'डिस्पैच की मूल जानकारी' : 'Dispatch Basics'} description={language === 'hi' ? 'इस डिस्पैच के लिए मुख्य विवरण भरें।' : 'Fill in the core details for this dispatch.'} />
                        <div className="mt-3 grid grid-cols-2 gap-4">
                          <StockFormField control={dispatchForm.control} name="shipmentNumber" label={t('dispatchNo')} placeholder="DSP-202X..." className={FORM_INPUT_CLASS} autoFocus />
                          <StockFormField control={dispatchForm.control} name="customerName" label={t('customer')} placeholder="Customer Name..." className={FORM_INPUT_CLASS} />
                        </div>
                      </div>
                      {/* Transport */}
                      <div className={FORM_CARD_CLASS}>
                        <FormSectionTitle icon={Truck} title={language === 'hi' ? 'डिस्पैच और वाहन' : 'Transport & Vehicle'} />
                        <div className="mt-3 grid grid-cols-2 gap-4">
                          <StockFormField control={dispatchForm.control} name="truckLicensePlate" label={t('truck')} placeholder="RJ 14 XY 0000" className={FORM_INPUT_CLASS} />
                          <StockFormField control={dispatchForm.control} name="driverName" label={t('driver')} placeholder="Driver Name..." className={FORM_INPUT_CLASS} />
                          <StockFormField control={dispatchForm.control} name="invoiceNumber" label={t('invoiceNo')} placeholder="INV-..." className={FORM_INPUT_CLASS} />
                          <StockDateTimeField control={dispatchForm.control} name="dispatchDate" label={tc.date} placeholder={tc.date} />
                          <StockFormField control={dispatchForm.control} name="salespersonName" label={t('salesperson')} placeholder="Salesperson..." className={FORM_INPUT_CLASS} />
                          <AttachmentField
                            label={tc.salesInvoicePhoto}
                            file={dispatchAttachments.salesInvoice}
                            onChange={(file) => setDispatchAttachment('salesInvoice', file)}
                            hint={tc.salesInvoiceHint}
                          />
                          <AttachmentField
                            label={tc.gatepassPhoto}
                            file={dispatchAttachments.gatepass}
                            onChange={(file) => setDispatchAttachment('gatepass', file)}
                            accept="image/*"
                            hint={tc.gatepassHint}
                          />
                        </div>
                      </div>
                      {/* Charges */}
                      <div className={FORM_CARD_CLASS}>
                        <FormSectionTitle icon={CreditCard} title={language === 'hi' ? 'खर्च' : 'Charges'} />
                        <div className="mt-3 grid grid-cols-2 gap-4">
                          <StockMoneyField control={dispatchForm.control} name="transportCost" label={t('transportCost')} hint={tc.amountInInr} />
                          <StockMoneyField control={dispatchForm.control} name="laborCost" label={t('laborCost')} hint={tc.amountInInr} />
                        </div>
                      </div>
                      {/* Items */}
                      <div className={FORM_CARD_CLASS}>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Boxes className="h-4 w-4 text-primary" />
                            <span>{t('items')}</span>
                          </div>
                          <button
                            type="button"
                            onClick={addDispatchItemRow}
                            className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Plus className="h-3.5 w-3.5" />
                              {t('addItem')}
                            </span>
                          </button>
                        </div>
                        {/* Column headers */}
                        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_100px_100px] gap-2 px-1">
                          <div className={FORM_LABEL_CLASS}>{t('sku')} / {t('name')}</div>
                          <div className={FORM_LABEL_CLASS}>{t('whole')}</div>
                          <div className={FORM_LABEL_CLASS}>{t('broken')}</div>
                        </div>
                        <div className="mt-2 space-y-2">
                          {dispatchItemsFieldArray.fields.map((fieldRow, index) => (
                            <div key={fieldRow.id} className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                              <div className="border-b border-border/60 bg-muted/30 px-3 py-2">
                                <span className="text-xs font-semibold text-foreground">{language === 'hi' ? 'आइटम' : 'Item'} {index + 1}</span>
                              </div>
                              <div className="grid grid-cols-[minmax(0,1fr)_100px_100px] gap-2 p-3 items-start">
                                <FormField
                                  control={dispatchForm.control}
                                  name={`items.${index}.itemId`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                                          <SelectTrigger className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
                                            <SelectValue placeholder={t('selectItem')} />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {(data?.activeItems || []).map((stockItem) => (
                                              <SelectItem key={stockItem.id} value={String(stockItem.id)}>
                                                {stockItem.sku} - {stockItem.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </FormControl>
                                      <FormMessage className="text-xs" />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={dispatchForm.control}
                                  name={`items.${index}.loadedWholeQty`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Input {...field} value={field.value ?? ''} type="number" min="0" placeholder="0" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                      </FormControl>
                                      <FormMessage className="text-xs" />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={dispatchForm.control}
                                  name={`items.${index}.loadedBrokenQty`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Input {...field} value={field.value ?? ''} type="number" min="0" placeholder="0" className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                      </FormControl>
                                      <FormMessage className="text-xs" />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Notes */}
                      <div className={FORM_CARD_CLASS}>
                        <FormField
                          control={dispatchForm.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className={FORM_LABEL_CLASS}>{t('notes')}</FormLabel>
                              <FormControl>
                                <Textarea {...field} value={field.value ?? ''} className={`${FORM_INPUT_CLASS} mt-1`} rows={2} />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={dispatchSubmitting}
                        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="inline-flex items-center justify-center gap-2">
                          <Send className="h-4 w-4" />
                          {dispatchSubmitting ? tc.submitting : t('submitDispatch')}
                        </span>
                      </button>
                    </form>
                  </Form>
                </SheetContent>
              </Sheet>
            </div>
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <input
                type="search"
                value={dispatchSearch}
                onChange={(event) => setDispatchSearch(event.target.value)}
                placeholder={tc.searchDispatches}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-3 p-3 md:hidden">
              {dispatchPagination.rows.map((d) => {
                const expanded = dispatchExpandedId === d.id;
                return (
                  <article key={`dispatch-mobile-${d.id}`} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openShipmentPreview('dispatch', d)}
                        className="min-w-0 flex-1 text-left"
                        aria-label={`Open dispatch ${d.shipment_number}`}
                      >
                        <p className="break-all font-mono text-xs font-semibold text-primary">{d.shipment_number}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(d.dispatch_date || d.created_at)}</p>
                      </button>
                      <Badge variant={getStatusVariant(d.status)}>{d.status}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{Number(d.total_whole_qty || 0)} whole / {Number(d.total_broken_qty || 0)} broken</p>
                    {expanded ? (
                      <div className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <p className="truncate">{d.product_names || d.product_skus || '—'}</p>
                        <p>By: {d.generated_by || '—'}</p>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setDispatchExpandedId((current) => (current === d.id ? null : d.id))}
                      className="mt-2 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      aria-label={expanded ? 'Collapse dispatch details' : 'Expand dispatch details'}
                    >
                      {expanded ? 'Collapse' : 'Expand'}
                    </button>
                  </article>
                );
              })}
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="hidden w-full text-xs text-left whitespace-nowrap md:table">
                <thead className="sticky top-0 bg-slate-50/90 font-medium text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'datetime')} className="font-medium hover:text-foreground">
                        {tc.datetime}
                      </button>
                    </th>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'shipment')} className="font-medium hover:text-foreground">
                        {t('dispatchNo')}
                      </button>
                    </th>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'products')} className="font-medium hover:text-foreground">
                        Products
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'quantities')} className="font-medium hover:text-foreground">
                        Quantities
                      </button>
                    </th>
                    <th className="px-3 py-2">
                      <button type="button" onClick={() => toggleSort(dispatchSort, setDispatchSort, 'status')} className="font-medium hover:text-foreground">
                        {t('status')}
                      </button>
                    </th>
                    <th className="px-3 py-2">{tc.generatedBy}</th>
                    <th className="px-3 py-2">{tc.approvedBy}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dispatchPagination.rows.map((d) => (
                    <tr
                      key={d.id}
                      className={`cursor-pointer transition hover:bg-slate-50 focus-within:bg-slate-50 dark:hover:bg-slate-800/40 dark:focus-within:bg-slate-800/40 ${highlightedShipmentKey === `dispatch-${d.id}` ? 'bg-[#E07A00]/10 ring-1 ring-[#E07A00]/40' : 'odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/70'
                        }`}
                      onClick={() => openShipmentPreview('dispatch', d)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openShipmentPreview('dispatch', d);
                        }
                      }}
                      title="Click to preview"
                    >
                      <td className="px-3 py-2 text-muted-foreground">{formatDateTime(d.dispatch_date || d.created_at)}</td>
                      <td className="px-3 py-2 font-mono font-medium text-primary">{d.shipment_number}</td>
                      <td className="px-3 py-2">
                        <div className="max-w-[260px] truncate" title={d.product_names || d.product_skus || ''}>
                          {d.product_names || d.product_skus || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {Number(d.total_whole_qty || 0)} whole / {Number(d.total_broken_qty || 0)} broken
                      </td>
                      <td className="px-3 py-2"><Badge variant={getStatusVariant(d.status)}>{d.status}</Badge></td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span>{d.generated_by || '—'}</span>
                          <Badge variant="neutral" className="text-[10px]">{getGeneratedByRoleLabel(d.generated_by_role)}</Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{d.approved_by || '—'}</td>
                    </tr>
                  ))}
                  {dispatchPagination.total === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-3 py-10">
                        <div className="flex flex-col items-center justify-center gap-3 text-center">
                          <PackageCheck className="h-6 w-6 text-slate-400" />
                          <p className="text-sm text-slate-500 dark:text-slate-400">{tc.noDispatches}</p>
                          <button
                            type="button"
                            onClick={() => setDispatchSearch('')}
                            className="rounded-xl bg-[#E07A00] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#c96d00] focus:outline-none focus:ring-2 focus:ring-[#E07A00]/20"
                          >
                            {tc.clearFilters}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={dispatchPagination.page}
              pageCount={dispatchPagination.pageCount}
              total={dispatchPagination.total}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setDispatchPage}
              labels={{
                showing: tc.paginationShowing,
                of: tc.paginationOf,
                previous: tc.paginationPrevious,
                next: tc.paginationNext,
                page: tc.paginationPage,
              }}
            />
          </section>
        </div>
      )}

      <EntryPreviewSheet
        open={previewState.open}
        onOpenChange={(open) => {
          if (!open) {
            closePreview();
          }
        }}
        title={previewState.title}
        description={previewState.description}
        summary={
          previewState.loading ? (
            <div className="text-sm text-slate-500">{tc.loadingPreview}</div>
          ) : previewState.error ? (
            <div className="text-sm text-red-600">{previewState.error}</div>
          ) : null
        }
        sections={
          previewState.kind === 'stock'
            ? [
              {
                title: 'Item Details',
                children: (
                  <PreviewKeyValueGrid
                    items={[
                      { label: 'SKU', value: previewState.record?.sku },
                      { label: 'Name', value: previewState.record?.name },
                      { label: 'Size', value: previewState.record?.size_label },
                      { label: 'Whole Qty', value: previewState.record?.current_whole_qty },
                      { label: 'Broken Qty', value: previewState.record?.current_broken_qty },
                      { label: 'Reorder Level', value: previewState.record?.reorder_level },
                      { label: 'Tiles / Box', value: previewState.record?.tiles_per_box },
                    ]}
                  />
                ),
              },
            ]
            : [
              {
                title: isInboundPreview ? 'ERP Header' : 'Shipment Details',
                children: (
                  isInboundPreview ? (
                    <div className={INVOICE_CLASSES.surface}>
                      <div className={INVOICE_CLASSES.commandCard}>
                        <div className="grid gap-4 md:grid-cols-[1.15fr_1fr] md:items-start">
                          <div>
                            <div className={INVOICE_CLASSES.supplierTitle}>{previewState.record?.supplier_name || 'Supplier'}</div>
                            <div className={INVOICE_CLASSES.supplierMeta}>GSTIN: {previewState.record?.supplier_gst_number || '—'}</div>
                            <div className={INVOICE_CLASSES.supplierMeta}>{previewState.record?.supplier_address || 'Address not available'}</div>
                            <div className="mt-3 font-mono text-xs font-semibold text-[#E07A00]">{previewState.record?.shipment_number || '—'}</div>
                          </div>
                          <div className={INVOICE_CLASSES.logisticsGrid}>
                            <div className={INVOICE_CLASSES.logisticsCell}>
                              <div className={INVOICE_CLASSES.logisticsLabel}><Hash className="h-3 w-3" />{tc.invoiceNoLabel}</div>
                              <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.invoice_number || '—'}</div>
                            </div>
                            <div className={INVOICE_CLASSES.logisticsCell}>
                              <div className={INVOICE_CLASSES.logisticsLabel}><Calendar className="h-3 w-3" />{tc.date}</div>
                              <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.invoice_date ? formatDateTime(previewState.record?.invoice_date) : '—'}</div>
                            </div>
                            <div className={INVOICE_CLASSES.logisticsCell}>
                              <div className={INVOICE_CLASSES.logisticsLabel}><Truck className="h-3 w-3" />{tc.vehicleNo}</div>
                              <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.truck_license_plate || previewState.record?.truck_number || '—'}</div>
                            </div>
                            <div className={INVOICE_CLASSES.logisticsCell}>
                              <div className={INVOICE_CLASSES.logisticsLabel}><Truck className="h-3 w-3" />{tc.transporter}</div>
                              <div className={INVOICE_CLASSES.logisticsValue}>{previewState.record?.transporter_name || '—'}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {hasTechnicalSubBar ? (
                        <div className="px-4 pb-4">
                          <div className={INVOICE_CLASSES.subBar}>
                            {previewState.record?.eway_bill_number ? <span>E-WAY: {previewState.record?.eway_bill_number}</span> : null}
                            {previewState.record?.irn_number ? <span>IRN: {previewState.record?.irn_number}</span> : null}
                          </div>
                        </div>
                      ) : null}
                      <div className="px-4 pb-4">
                        <PreviewKeyValueGrid items={inboundMetaItems} />
                      </div>
                    </div>
                  ) : (
                    <PreviewKeyValueGrid
                      items={[
                        { label: 'Shipment No.', value: previewState.record?.shipment_number },
                        { label: 'Status', value: previewState.record?.status },
                        { label: 'Approval', value: previewState.record?.approval_status },
                        { label: 'Datetime', value: formatDateTime(previewState.record?.arrival_date || previewState.record?.dispatch_date || previewState.record?.created_at) },
                        { label: 'Truck', value: previewState.record?.truck_license_plate || previewState.record?.truck_number },
                        { label: 'Driver', value: previewState.record?.driver_name },
                        { label: 'Invoice No.', value: previewState.record?.invoice_number },
                        { label: 'Gatepass No.', value: previewState.record?.gatepass_number },
                        { label: 'Customer', value: previewState.record?.customer_name },
                        { label: 'Total Whole', value: previewState.record?.total_whole_qty },
                        { label: 'Total Broken', value: previewState.record?.total_broken_qty },
                        { label: 'Notes', value: previewState.record?.notes },
                      ]}
                    />
                  )
                ),
              },
              previewState.items?.length
                ? {
                  title: isInboundPreview ? 'Industrial Line Items' : 'Line Items',
                  children: (
                    <>
                      {isInboundPreview ? (
                        <div className={INVOICE_CLASSES.mobileGrid}>
                          {previewItemPagination.rows.map((item, index) => (
                            <article key={`inbound-mobile-item-${item.id || index}`} className={INVOICE_CLASSES.mobileCard}>
                              <div className={INVOICE_CLASSES.mobileCardHeader}>Line {index + 1}</div>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <div>
                                  <div className={INVOICE_CLASSES.mobileKey}>{tc.description}</div>
                                  <div className={INVOICE_CLASSES.mobileValue}>{item.item_name || item.sku || '—'}</div>
                                </div>
                                <div>
                                  <div className={INVOICE_CLASSES.mobileKey}>HSN</div>
                                  <div className={INVOICE_CLASSES.mobileValue}>{item.hsn_code || '—'}</div>
                                </div>
                                <div>
                                  <div className={INVOICE_CLASSES.mobileKey}>{t('size')}</div>
                                  <div className={INVOICE_CLASSES.mobileValue}>{item.size_label || '—'}</div>
                                </div>
                                <div>
                                  <div className={INVOICE_CLASSES.mobileKey}>{tc.wholeBox}</div>
                                  <div className={INVOICE_CLASSES.mobileValue}>{item.received_whole_qty ?? item.loaded_whole_qty ?? 0}</div>
                                </div>
                                <div className="col-span-2">
                                  <div className={INVOICE_CLASSES.mobileKey}>{tc.totalSqmQty}</div>
                                  <div className={INVOICE_CLASSES.mobileValue}>
                                    {item.qty_sqm != null ? Number(item.qty_sqm).toFixed(3) : Number((item.received_whole_qty ?? 0) + (item.received_broken_qty ?? 0)).toFixed(0)}
                                  </div>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : null}
                      <div className={isInboundPreview ? `hidden md:block ${INVOICE_CLASSES.tableWrap}` : 'overflow-hidden rounded-2xl border border-border bg-card'}>
                        <table className="w-full text-left text-sm">
                          <thead className={isInboundPreview ? INVOICE_CLASSES.tableHead : 'bg-muted/70 text-muted-foreground'}>
                            <tr>
                              {isInboundPreview ? (
                                <>
                                  <th className={INVOICE_CLASSES.tableHeadCell}>{tc.srNo}</th>
                                  <th className={INVOICE_CLASSES.tableHeadCell}>{tc.description}</th>
                                  <th className={INVOICE_CLASSES.tableHeadCell}>HSN</th>
                                  <th className={INVOICE_CLASSES.tableHeadCell}>{t('size')}</th>
                                  <th className={`${INVOICE_CLASSES.tableHeadCell} text-right`}>{tc.wholeBox}</th>
                                  <th className={`${INVOICE_CLASSES.tableHeadCell} text-right`}>{tc.totalSqmQty}</th>
                                </>
                              ) : (
                                <>
                                  <th className="px-3 py-2">{t('sku')}</th>
                                  <th className="px-3 py-2">{t('name')}</th>
                                  <th className="px-3 py-2">HSN</th>
                                  <th className="px-3 py-2">{tc.division}</th>
                                  <th className="px-3 py-2 text-right">{tc.sqm}</th>
                                  <th className="px-3 py-2 text-right">{tc.costPerSqm}</th>
                                  <th className="px-3 py-2 text-right">{t('whole')}</th>
                                  <th className="px-3 py-2 text-right">{t('broken')}</th>
                                  <th className="px-3 py-2">{t('notes')}</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody className={isInboundPreview ? 'bg-white dark:bg-slate-950' : 'divide-y divide-border bg-card'}>
                            {previewItemPagination.rows.map((item, index) => (
                              <tr key={item.id || `preview-item-${index}`} className={isInboundPreview ? INVOICE_CLASSES.tableRow : ''}>
                                {isInboundPreview ? (
                                  <>
                                    <td className={`${INVOICE_CLASSES.tableCell} ${INVOICE_CLASSES.monoCell}`}>{index + 1}</td>
                                    <td className={INVOICE_CLASSES.tableCell}>{item.item_name || item.sku || '—'}</td>
                                    <td className={`${INVOICE_CLASSES.tableCell} ${INVOICE_CLASSES.monoCell}`}>{item.hsn_code || '—'}</td>
                                    <td className={`${INVOICE_CLASSES.tableCell} ${INVOICE_CLASSES.monoCell}`}>{item.size_label || '—'}</td>
                                    <td className={`${INVOICE_CLASSES.tableCell} ${INVOICE_CLASSES.monoCell} text-right`}>{item.received_whole_qty ?? item.loaded_whole_qty ?? 0}</td>
                                    <td className={`${INVOICE_CLASSES.tableCell} ${INVOICE_CLASSES.monoCell} text-right`}>
                                      {item.qty_sqm != null ? Number(item.qty_sqm).toFixed(3) : Number((item.received_whole_qty ?? 0) + (item.received_broken_qty ?? 0)).toFixed(0)}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-3 py-2 font-medium text-foreground">{item.sku}</td>
                                    <td className="px-3 py-2 text-foreground/80">{item.item_name}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{item.hsn_code || '—'}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{item.division_name || item.department || '—'}</td>
                                    <td className="px-3 py-2 text-right">{item.qty_sqm != null ? Number(item.qty_sqm).toFixed(3) : '—'}</td>
                                    <td className="px-3 py-2 text-right">{item.cost_per_sqm != null ? Number(item.cost_per_sqm).toFixed(2) : '—'}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_whole_qty ?? item.received_whole_qty ?? 0}</td>
                                    <td className="px-3 py-2 text-right">{item.loaded_broken_qty ?? item.received_broken_qty ?? 0}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{item.notes || '—'}</td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <PaginationControls
                        page={previewItemPagination.page}
                        pageCount={previewItemPagination.pageCount}
                        total={previewItemPagination.total}
                        pageSize={DEFAULT_PAGE_SIZE}
                        onPageChange={setPreviewItemsPage}
                        labels={{
                          showing: tc.paginationShowing,
                          of: tc.paginationOf,
                          previous: tc.paginationPrevious,
                          next: tc.paginationNext,
                          page: tc.paginationPage,
                        }}
                      />
                    </>
                  ),
                }
                : null,
              previewState.documents?.length
                ? {
                  title: 'Linked Documents',
                  children: (
                    <div className="grid gap-4 xl:grid-cols-2">
                      {previewState.documents.map((document) => (
                        <section
                          key={document.id}
                          className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                        >
                          <div className="border-b border-border bg-muted/40 px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{document.document_type}</div>
                            <div className="mt-1 text-sm font-medium text-foreground">{document.document_number || document.file_name}</div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">{document.file_name}</div>
                          </div>
                          <div className="p-4">
                            {renderDocumentPreview(document)}
                          </div>
                        </section>
                      ))}
                    </div>
                  ),
                }
                : null,
            ]
        }
      />


    </div>
  );
}
