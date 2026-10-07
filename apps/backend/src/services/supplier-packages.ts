export type SupplierPackageEffect = 'featured' | 'sponsored' | null;

export interface SupplierPackage {
  key: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  priceAed: number;
  unit: string;
  effect: SupplierPackageEffect;
}

export const supplierPackages: SupplierPackage[] = [
  {
    key: 'featured_home',
    name: 'Featured on Home',
    nameAr: 'مميز على الصفحة الرئيسية',
    description: 'Feature an event on the Migo home page.',
    descriptionAr: 'اعرض الفعالية على الصفحة الرئيسية في Migo.',
    priceAed: 1500,
    unit: 'week',
    effect: 'featured',
  },
  {
    key: 'sponsored_search',
    name: 'Sponsored search placement',
    nameAr: 'ظهور مميز في البحث',
    description: 'Promote an event in relevant search results.',
    descriptionAr: 'روّج للفعالية ضمن نتائج البحث ذات الصلة.',
    priceAed: 1200,
    unit: 'week',
    effect: 'sponsored',
  },
  {
    key: 'this_week_spotlight',
    name: 'This Week For You spotlight',
    nameAr: 'اختيار هذا الأسبوع لك',
    description: 'Spotlight an event in This Week For You.',
    descriptionAr: 'أبرز الفعالية ضمن اختيارات هذا الأسبوع.',
    priceAed: 900,
    unit: 'week',
    effect: 'featured',
  },
  {
    key: 'weekend_digest',
    name: 'Weekend digest inclusion',
    nameAr: 'إدراج في ملخص عطلة نهاية الأسبوع',
    description: 'Include an event in the weekend digest.',
    descriptionAr: 'أدرج الفعالية في ملخص عطلة نهاية الأسبوع.',
    priceAed: 700,
    unit: 'issue',
    effect: null,
  },
  {
    key: 'push_blast',
    name: 'Targeted push & WhatsApp blast to interested users',
    nameAr: 'إشعار ورسالة واتساب للجمهور المهتم',
    description: 'Promote an event to users with matching interests.',
    descriptionAr: 'روّج للفعالية للمستخدمين المهتمين عبر الإشعارات وواتساب.',
    priceAed: 2500,
    unit: 'campaign',
    effect: null,
  },
  {
    key: 'category_takeover',
    name: 'Category takeover',
    nameAr: 'استحواذ على فئة',
    description: 'Feature a supplier in a selected event category.',
    descriptionAr: 'أبرز المصدر ضمن فئة فعاليات محددة.',
    priceAed: 2000,
    unit: 'week',
    effect: null,
  },
  {
    key: 'map_highlight',
    name: 'Highlighted map pin & venue page',
    nameAr: 'تمييز الموقع وصفحة المكان على الخريطة',
    description: 'Highlight a venue on the map and venue page.',
    descriptionAr: 'أبرز الموقع وصفحة المكان على الخريطة.',
    priceAed: 600,
    unit: 'month',
    effect: null,
  },
  {
    key: 'verified_badge',
    name: 'Verified official-source badge',
    nameAr: 'شارة مصدر رسمي موثّق',
    description: 'Display a verified badge on a supplier source.',
    descriptionAr: 'اعرض شارة توثيق للمصدر الرسمي.',
    priceAed: 500,
    unit: 'year',
    effect: null,
  },
  {
    key: 'audience_report',
    name: 'Monthly audience insights report',
    nameAr: 'تقرير شهري عن الجمهور',
    description: 'Receive a monthly report on audience activity.',
    descriptionAr: 'احصل على تقرير شهري لنشاط الجمهور.',
    priceAed: 800,
    unit: 'month',
    effect: null,
  },
  {
    key: 'retargeting',
    name: 'Saved-but-not-booked reminders',
    nameAr: 'تذكير المهتمين الذين لم يحجزوا',
    description: 'Remind users who saved an event but did not book.',
    descriptionAr: 'ذكّر المستخدمين الذين حفظوا الفعالية ولم يحجزوا.',
    priceAed: 1000,
    unit: 'month',
    effect: null,
  },
];

export function getSupplierPackage(packageKey: string): SupplierPackage | undefined {
  return supplierPackages.find(supplierPackage => supplierPackage.key === packageKey);
}
