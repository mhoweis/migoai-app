export type SourceKind = 'official' | 'venue' | 'ticketing' | 'community' | 'organizer' | 'demo';
export type RefundPolicy = 'external' | 'organizer' | 'free';

export interface SourceInfo {
  id: string;
  label: string;
  labelAr: string;
  kind: SourceKind;
  url: string;
  refundPolicy: RefundPolicy;
}

const sources: Record<string, SourceInfo> = {
  'visit-dubai': {
    id: 'visit-dubai',
    label: 'Visit Dubai',
    labelAr: 'زوروا دبي',
    kind: 'official',
    url: 'https://www.visitdubai.com',
    refundPolicy: 'external',
  },
  'visit-abu-dhabi': {
    id: 'visit-abu-dhabi',
    label: 'Visit Abu Dhabi',
    labelAr: 'زوروا أبوظبي',
    kind: 'official',
    url: 'https://visitabudhabi.ae',
    refundPolicy: 'external',
  },
  'visit-sharjah': {
    id: 'visit-sharjah',
    label: 'Visit Sharjah',
    labelAr: 'زوروا الشارقة',
    kind: 'official',
    url: 'https://www.visitsharjah.com',
    refundPolicy: 'external',
  },
  'uae-gov': {
    id: 'uae-gov',
    label: 'UAE Government',
    labelAr: 'حكومة الإمارات',
    kind: 'official',
    url: 'https://u.ae',
    refundPolicy: 'external',
  },
  'expo-city': {
    id: 'expo-city',
    label: 'Expo City Dubai',
    labelAr: 'مدينة إكسبو دبي',
    kind: 'venue',
    url: 'https://www.expocitydubai.com',
    refundPolicy: 'external',
  },
  dwtc: {
    id: 'dwtc',
    label: 'Dubai World Trade Centre',
    labelAr: 'مركز دبي التجاري العالمي',
    kind: 'venue',
    url: 'https://www.dwtc.com',
    refundPolicy: 'external',
  },
  'dubai-exhibition-centre': {
    id: 'dubai-exhibition-centre',
    label: 'Dubai Exhibition Centre',
    labelAr: 'مركز دبي للمعارض',
    kind: 'venue',
    url: 'https://www.dubaiexhibitioncentre.com',
    refundPolicy: 'external',
  },
  'expo-centre-sharjah': {
    id: 'expo-centre-sharjah',
    label: 'Expo Centre Sharjah',
    labelAr: 'مركز إكسبو الشارقة',
    kind: 'venue',
    url: 'https://www.expo-centre.ae',
    refundPolicy: 'external',
  },
  'yas_island': {
    id: 'yas_island',
    label: 'Yas Island',
    labelAr: 'جزيرة ياس',
    kind: 'venue',
    url: 'https://www.yasisland.com',
    refundPolicy: 'external',
  },
  alserkal: {
    id: 'alserkal',
    label: 'Alserkal Avenue',
    labelAr: 'السركال أفنيو',
    kind: 'venue',
    url: 'https://alserkal.online',
    refundPolicy: 'external',
  },
  'abu-dhabi-festival': {
    id: 'abu-dhabi-festival',
    label: 'Abu Dhabi Festival',
    labelAr: 'مهرجان أبوظبي',
    kind: 'venue',
    url: 'https://abudhabifestival.ae',
    refundPolicy: 'external',
  },
  'my-dubai-communities': {
    id: 'my-dubai-communities',
    label: 'MyDubai Communities',
    labelAr: 'مجتمعات دبي',
    kind: 'community',
    url: 'https://mydubaicommunities.com',
    refundPolicy: 'external',
  },
  ticketmaster: {
    id: 'ticketmaster',
    label: 'Ticketmaster',
    labelAr: 'تيكيت ماستر',
    kind: 'ticketing',
    url: 'https://www.ticketmaster.ae',
    refundPolicy: 'external',
  },
  luma: {
    id: 'luma',
    label: 'Luma',
    labelAr: 'Luma',
    kind: 'community',
    url: 'https://lu.ma',
    refundPolicy: 'external',
  },
  eventbrite: {
    id: 'eventbrite',
    label: 'Eventbrite',
    labelAr: 'Eventbrite',
    kind: 'community',
    url: 'https://www.eventbrite.com',
    refundPolicy: 'external',
  },
  migo: {
    id: 'migo',
    label: 'Hosted on Migo',
    labelAr: 'مستضاف على Migo',
    kind: 'organizer',
    url: '',
    refundPolicy: 'organizer',
  },
  mock: {
    id: 'mock',
    label: 'Migo Demo',
    labelAr: 'نسخة Migo التجريبية',
    kind: 'demo',
    url: '',
    refundPolicy: 'free',
  },
};

export function getSourceInfo(externalSource?: string | null, source?: string | null): SourceInfo {
  const slug = (externalSource || source || 'unknown').trim().toLowerCase();
  return sources[slug] || {
    id: slug,
    label: slug,
    labelAr: slug,
    kind: 'community',
    url: '',
    refundPolicy: 'external',
  };
}

export default sources;
