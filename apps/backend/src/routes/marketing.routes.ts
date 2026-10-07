import path from 'path';
import express, { Router, Request, Response } from 'express';
import config from '../config/env';

type Language = 'en' | 'ar';
type FeatureIcon = 'search' | 'ticket' | 'qr' | 'sparkles' | 'friends' | 'globe';
type Feature = { icon: FeatureIcon; title: string; body: string };
type Step = { title: string; body: string };

type WelcomeCopy = {
  title: string;
  description: string;
  navWebsite: string;
  navDownload: string;
  switchLabel: string;
  eyebrow: string;
  heroTitle: string;
  heroAccent: string;
  heroBody: string;
  ctaWebsite: string;
  ctaDownload: string;
  heroNote: string;
  sourcesLabel: string;
  featuresTitle: string;
  featuresBody: string;
  features: Feature[];
  stepsTitle: string;
  steps: Step[];
  showcaseTitle: string;
  showcaseBody: string;
  screens: { file: string; label: string }[];
  hostTitle: string;
  hostBody: string;
  hostPoints: string[];
  hostCta: string;
  downloadTitle: string;
  downloadBody: string;
  appStoreTop: string;
  playStoreTop: string;
  comingSoon: string;
  websiteCardTitle: string;
  websiteCardBody: string;
  websiteCardCta: string;
  footerTagline: string;
  privacy: string;
  terms: string;
  contact: string;
  rights: string;
};

const officialSources = ['Visit Dubai', 'DWTC', 'Visit Abu Dhabi', 'Visit Sharjah', 'ADNEC Centre Abu Dhabi', 'Expo City Dubai', 'Dubai Exhibition Centre', 'MyDubai Communities', 'Heart of RAK', 'DIFC'];

const copy: Record<Language, WelcomeCopy> = {
  en: {
    title: 'Migo · Every UAE event, one app',
    description: 'Discover concerts, festivals, exhibitions and community meetups across the UAE. Book in seconds and keep every ticket in your Migo wallet.',
    navWebsite: 'Open the website',
    navDownload: 'Get the app',
    switchLabel: 'العربية',
    eyebrow: 'Made for the UAE',
    heroTitle: 'Every event in the UAE.',
    heroAccent: 'One place to go.',
    heroBody: 'Migo brings together events from the venues and organizers you trust, from Dubai to Abu Dhabi, Sharjah and beyond. Find something great tonight, book it in seconds and walk in with your ticket already in your wallet.',
    ctaWebsite: 'Explore events on the web',
    ctaDownload: 'Download the app',
    heroNote: 'Free to join · English & العربية',
    sourcesLabel: 'Events from official UAE sources',
    featuresTitle: 'Everything you need for a great night out',
    featuresBody: 'No more jumping between ten websites. Migo does the searching, so you can do the going.',
    features: [
      { icon: 'search', title: 'All events, one search', body: 'Concerts, sport, art, food, business and family events from trusted UAE sources, always up to date and only from today onwards.' },
      { icon: 'ticket', title: 'Book in seconds', body: 'RSVP to free events in one tap or check out securely for paid tickets, without leaving Migo.' },
      { icon: 'qr', title: 'Tickets in your wallet', body: 'Every booking lands in your Migo wallet with a secure QR code. Show it at the door and you are in.' },
      { icon: 'sparkles', title: 'Ask Migo', body: 'Tell our AI assistant what you are in the mood for and get personal picks for tonight or the weekend.' },
      { icon: 'friends', title: 'Go with friends', body: 'Follow friends, see who is going, invite your group on WhatsApp and share reviews after the event.' },
      { icon: 'globe', title: 'English and Arabic', body: 'A full Arabic, right-to-left experience alongside English, on the web and in the app.' },
    ],
    stepsTitle: 'From “what should we do?” to “we are here” in three steps',
    steps: [
      { title: 'Discover', body: 'Browse what is on near you, filter by city, date and category, or simply ask Migo.' },
      { title: 'Book', body: 'Reserve your spot or buy your ticket right inside the app or on the website.' },
      { title: 'Check in', body: 'Open your wallet at the venue, show the QR code and enjoy the event.' },
    ],
    showcaseTitle: 'Designed to make going out effortless',
    showcaseBody: 'A clean, fast experience on your phone and on the web.',
    screens: [
      { file: 'screen-home.jpg', label: 'Your personal home' },
      { file: 'screen-discover.jpg', label: 'Discover what is on' },
      { file: 'screen-detail.jpg', label: 'Every detail in one place' },
      { file: 'screen-wallet.jpg', label: 'Tickets in your wallet' },
    ],
    hostTitle: 'Hosting an event? Grow your community with Migo.',
    hostBody: 'Hosts and event suppliers reach people who are actively looking for something to do, and manage everything from one dashboard.',
    hostPoints: ['Create free or paid events in minutes', 'Scan tickets at the door with QR check-in', 'Track followers, registrations and check-ins', 'Boost your events to reach more people'],
    hostCta: 'Become a host',
    downloadTitle: 'Take Migo with you',
    downloadBody: 'Get the Migo app for iPhone and Android, or open Migo in any browser. Your account, tickets and saved events stay in sync everywhere.',
    appStoreTop: 'Download on the',
    playStoreTop: 'Get it on',
    comingSoon: 'Coming soon',
    websiteCardTitle: 'Prefer the browser?',
    websiteCardBody: 'Everything in the app also works on the Migo website, on desktop, tablet and mobile.',
    websiteCardCta: 'Open Migo on the web',
    footerTagline: 'Make room for what’s happening.',
    privacy: 'Privacy',
    terms: 'Terms',
    contact: 'Contact',
    rights: 'Migo. Made for the UAE.',
  },
  ar: {
    title: 'ميجو · كل فعاليات الإمارات في تطبيق واحد',
    description: 'اكتشف الحفلات والمهرجانات والمعارض ولقاءات المجتمع في جميع أنحاء الإمارات. احجز خلال ثوانٍ واحتفظ بكل تذاكرك في محفظة ميجو.',
    navWebsite: 'افتح الموقع',
    navDownload: 'حمّل التطبيق',
    switchLabel: 'English',
    eyebrow: 'صُمم للإمارات',
    heroTitle: 'كل فعاليات الإمارات.',
    heroAccent: 'وجهة واحدة.',
    heroBody: 'يجمع ميجو الفعاليات من الجهات والمنظمين الذين تثق بهم، من دبي إلى أبوظبي والشارقة وغيرها. اعثر على فعالية رائعة الليلة، واحجزها خلال ثوانٍ، وادخل وتذكرتك جاهزة في محفظتك.',
    ctaWebsite: 'استكشف الفعاليات على الموقع',
    ctaDownload: 'حمّل التطبيق',
    heroNote: 'التسجيل مجاني · العربية و English',
    sourcesLabel: 'فعاليات من مصادر إماراتية رسمية',
    featuresTitle: 'كل ما تحتاجه لأمسية رائعة',
    featuresBody: 'لا داعي للتنقل بين عشرة مواقع. ميجو يبحث عنك، وأنت تستمتع.',
    features: [
      { icon: 'search', title: 'كل الفعاليات في بحث واحد', body: 'حفلات ورياضة وفنون وطعام وأعمال وفعاليات عائلية من مصادر موثوقة، محدثة دائماً ومن اليوم فصاعداً.' },
      { icon: 'ticket', title: 'احجز خلال ثوانٍ', body: 'سجّل في الفعاليات المجانية بلمسة واحدة أو ادفع بأمان للتذاكر المدفوعة دون مغادرة ميجو.' },
      { icon: 'qr', title: 'تذاكرك في محفظتك', body: 'كل حجز يصل إلى محفظة ميجو مع رمز QR آمن. اعرضه عند الدخول وانطلق.' },
      { icon: 'sparkles', title: 'اسأل ميجو', body: 'أخبر مساعدنا الذكي بما تحب واحصل على اقتراحات شخصية لليلة أو لعطلة نهاية الأسبوع.' },
      { icon: 'friends', title: 'اذهب مع أصدقائك', body: 'تابع أصدقاءك، واعرف من سيحضر، وادعُ مجموعتك عبر واتساب، وشارك تقييمك بعد الفعالية.' },
      { icon: 'globe', title: 'العربية والإنجليزية', body: 'تجربة عربية كاملة من اليمين إلى اليسار إلى جانب الإنجليزية، على الموقع وفي التطبيق.' },
    ],
    stepsTitle: 'من «ماذا نفعل؟» إلى «وصلنا» في ثلاث خطوات',
    steps: [
      { title: 'اكتشف', body: 'تصفح ما يحدث بالقرب منك، وصفِّ حسب المدينة والتاريخ والفئة، أو اسأل ميجو ببساطة.' },
      { title: 'احجز', body: 'احجز مكانك أو اشترِ تذكرتك داخل التطبيق أو على الموقع.' },
      { title: 'سجّل حضورك', body: 'افتح محفظتك عند المكان، واعرض رمز QR، واستمتع بالفعالية.' },
    ],
    showcaseTitle: 'مصمم ليجعل الخروج سهلاً',
    showcaseBody: 'تجربة سريعة وأنيقة على هاتفك وعلى الموقع.',
    screens: [
      { file: 'screen-home.jpg', label: 'صفحتك الرئيسية' },
      { file: 'screen-discover.jpg', label: 'اكتشف ما يحدث' },
      { file: 'screen-detail.jpg', label: 'كل التفاصيل في مكان واحد' },
      { file: 'screen-wallet.jpg', label: 'تذاكرك في محفظتك' },
    ],
    hostTitle: 'تنظم فعالية؟ نمِّ مجتمعك مع ميجو.',
    hostBody: 'يصل المنظمون ومزودو الفعاليات إلى أشخاص يبحثون فعلاً عن شيء يفعلونه، ويديرون كل شيء من لوحة تحكم واحدة.',
    hostPoints: ['أنشئ فعاليات مجانية أو مدفوعة خلال دقائق', 'امسح التذاكر عند الدخول عبر رمز QR', 'تابع المتابعين والتسجيلات والحضور', 'روّج لفعالياتك للوصول إلى جمهور أكبر'],
    hostCta: 'كن منظماً',
    downloadTitle: 'خذ ميجو معك',
    downloadBody: 'حمّل تطبيق ميجو على آيفون وأندرويد، أو افتح ميجو من أي متصفح. حسابك وتذاكرك وفعالياتك المحفوظة متزامنة في كل مكان.',
    appStoreTop: 'حمّله من',
    playStoreTop: 'احصل عليه من',
    comingSoon: 'قريباً',
    websiteCardTitle: 'تفضّل المتصفح؟',
    websiteCardBody: 'كل ما في التطبيق متاح أيضاً على موقع ميجو، على الكمبيوتر والجهاز اللوحي والهاتف.',
    websiteCardCta: 'افتح ميجو على الويب',
    footerTagline: 'افسح المجال لما يحدث.',
    privacy: 'الخصوصية',
    terms: 'الشروط',
    contact: 'تواصل معنا',
    rights: 'ميجو. صُنع للإمارات.',
  },
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const featureIcons: Record<FeatureIcon, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 18h3v3"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
  friends: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2A5 5 0 0 1 21.5 19"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
};

const featureIcon = (icon: FeatureIcon) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${featureIcons[icon]}</svg>`;

const appleIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.37 12.73c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.88-1.28 1.24-2.52 1.26-2.59-.03-.01-2.4-.92-2.42-3.65l.02-.03ZM14.1 5.98c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28Z"/></svg>';
const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#34A853" d="M3.6 2.3 13.4 12l-9.8 9.7c-.36-.2-.6-.6-.6-1.07V3.37c0-.47.24-.87.6-1.07Z"/><path fill="#FBBC04" d="m16.7 15.3-3.3-3.3 3.3-3.3 3.72 2.12c1.06.6 1.06 1.76 0 2.36L16.7 15.3Z"/><path fill="#EA4335" d="M13.4 12 3.6 21.7c.3.17.68.18 1.05-.03L16.7 15.3 13.4 12Z"/><path fill="#4285F4" d="M13.4 12 16.7 8.7 4.65 2.33c-.37-.21-.75-.2-1.05-.03L13.4 12Z"/></svg>';

const storeBadge = (href: string, icon: string, top: string, name: string, comingSoon: string) => {
  const inner = `${icon}<span class="badge-text"><small>${escapeHtml(href ? top : comingSoon)}</small><strong>${escapeHtml(name)}</strong></span>`;
  return href
    ? `<a class="store-badge" href="${escapeHtml(href)}" target="_blank" rel="noopener">${inner}</a>`
    : `<span class="store-badge is-soon" aria-disabled="true">${inner}</span>`;
};

const renderWelcome = (language: Language) => {
  const c = copy[language];
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const other: Language = language === 'ar' ? 'en' : 'ar';
  const appStore = storeBadge(config.APP_STORE_URL, appleIcon, c.appStoreTop, 'App Store', c.comingSoon);
  const playStore = storeBadge(config.PLAY_STORE_URL, playIcon, c.playStoreTop, 'Google Play', c.comingSoon);
  const features = c.features.map(f => `<article class="feature"><span class="feature-icon">${featureIcon(f.icon)}</span><h3>${escapeHtml(f.title)}</h3><p>${escapeHtml(f.body)}</p></article>`).join('');
  const steps = c.steps.map((s, i) => `<li class="step"><span class="step-num">${i + 1}</span><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.body)}</p></li>`).join('');
  const screens = c.screens.map(s => `<figure class="screen"><div class="phone"><img src="/welcome/assets/${s.file}" alt="${escapeHtml(s.label)}"></div><figcaption>${escapeHtml(s.label)}</figcaption></figure>`).join('');
  const hostPoints = c.hostPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('');
  const sources = officialSources.map(s => `<span>${escapeHtml(s)}</span>`).join('');

  return `<!doctype html>
<html lang="${language}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#241654">
  <title>${escapeHtml(c.title)}</title>
  <meta name="description" content="${escapeHtml(c.description)}">
  <meta property="og:title" content="${escapeHtml(c.title)}">
  <meta property="og:description" content="${escapeHtml(c.description)}">
  <meta property="og:image" content="/welcome/assets/app-icon.png">
  <link rel="icon" href="/welcome/assets/app-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;700&family=Noto+Kufi+Arabic:wght@400;600;800&display=swap">
  <style>
    :root{--ink:#140F2E;--muted:#5D5878;--pink:#D61F63;--orange:#FF8A3D;--gold:#FFB020;--plum:#241654;--soft:#F6F3FB;--line:#E9E4F2;
      --display:'Bricolage Grotesque','Noto Kufi Arabic','Plus Jakarta Sans',system-ui,sans-serif;--body:'Plus Jakarta Sans','Noto Kufi Arabic',system-ui,sans-serif}
    html[lang=ar]{--display:'Noto Kufi Arabic',system-ui,sans-serif;--body:'Noto Kufi Arabic',system-ui,sans-serif}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;font-family:var(--body);color:var(--ink);background:#fff;-webkit-font-smoothing:antialiased}
    a{color:inherit}
    img{max-width:100%;display:block}
    .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
    .grad-text{background:linear-gradient(90deg,#FF4F8B,var(--orange) 60%,var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:15px 26px;border-radius:999px;font-weight:700;font-size:16px;text-decoration:none;transition:transform .15s ease,box-shadow .15s ease}
    .btn:hover{transform:translateY(-2px)}
    .btn-primary{background:linear-gradient(135deg,#E0266B,#B8155A);color:#fff;box-shadow:0 12px 30px rgba(214,31,99,.35)}
    .btn-ghost{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.35)}
    .btn-light{background:#fff;color:var(--pink);box-shadow:0 10px 26px rgba(20,15,46,.18)}

    .hero{position:relative;overflow:hidden;color:#fff;background:radial-gradient(1200px 600px at 85% -10%,rgba(255,138,61,.55),transparent 60%),radial-gradient(900px 600px at 0% 100%,rgba(214,31,99,.55),transparent 60%),linear-gradient(160deg,#1A1040,var(--plum) 45%,#5B1A63)}
    .hero::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:56px 56px;mask-image:linear-gradient(180deg,#000,transparent 85%)}
    .nav{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0}
    .brand{display:flex;align-items:center;gap:10px;text-decoration:none}
    .brand img{width:46px;height:46px}
    .brand span{font-family:var(--display);font-size:26px;font-weight:800;letter-spacing:-.02em}
    .nav-links{display:flex;align-items:center;gap:8px}
    .nav-links a{padding:10px 16px;border-radius:999px;font-weight:600;font-size:15px;text-decoration:none;opacity:.92}
    .nav-links a:hover{background:rgba(255,255,255,.1);opacity:1}
    .nav-links .nav-cta{background:#fff;color:var(--pink);opacity:1}
    .hero-grid{position:relative;display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center;padding:48px 0 96px}
    .eyebrow{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);font-size:14px;font-weight:600}
    .eyebrow::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 4px rgba(255,176,32,.25)}
    .hero h1{font-family:var(--display);font-size:clamp(42px,6.4vw,78px);line-height:1.02;letter-spacing:-.035em;margin:22px 0 20px;font-weight:800}
    html[lang=ar] .hero h1{line-height:1.3;letter-spacing:0}
    .hero h1 .grad-text{display:block}
    .hero p.lead{font-size:clamp(17px,1.6vw,20px);line-height:1.65;color:rgba(255,255,255,.86);max-width:560px;margin:0 0 32px}
    .cta-row{display:flex;flex-wrap:wrap;gap:14px}
    .hero-note{margin-top:22px;font-size:14px;color:rgba(255,255,255,.7)}
    .hero-phones{position:relative;height:600px}
    .hero-phones .phone{position:absolute;width:270px}
    .hero-phones .p1{inset-inline-start:4%;top:40px;transform:rotate(-7deg)}
    .hero-phones .p2{inset-inline-end:4%;top:0;transform:rotate(5deg);z-index:2}
    .glow{position:absolute;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(255,176,32,.45),transparent 65%);inset-inline-end:10%;top:20%;filter:blur(10px)}
    .ticket-chip{position:absolute;z-index:3;inset-inline-start:0;bottom:36px;display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:18px;background:#fff;color:var(--ink);box-shadow:0 20px 40px rgba(0,0,0,.25);font-weight:700;font-size:15px}
    .ticket-chip small{display:block;font-weight:500;color:var(--muted);font-size:13px}
    .ticket-chip b{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#E9F8F1;color:#0E8A5F;font-size:20px}

    .phone{border-radius:38px;padding:9px;background:#0E0A22;box-shadow:0 30px 60px rgba(10,6,30,.45),inset 0 0 0 2px rgba(255,255,255,.08)}
    .phone img{border-radius:30px;width:100%;aspect-ratio:390/844;object-fit:cover;object-position:top}

    .sources{border-bottom:1px solid var(--line);background:#fff}
    .sources .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px 26px;padding:26px 24px}
    .sources p{margin:0;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
    html[lang=ar] .sources p{letter-spacing:0}
    .sources span{font-family:var(--display);font-weight:700;font-size:17px;color:#3B355A;opacity:.8}

    section{padding:96px 0}
    .section-head{max-width:720px;margin:0 auto 52px;text-align:center}
    .section-head h2{font-family:var(--display);font-size:clamp(32px,4vw,48px);line-height:1.1;letter-spacing:-.03em;margin:0 0 14px}
    html[lang=ar] .section-head h2,html[lang=ar] .host h2,html[lang=ar] .download h2{line-height:1.4;letter-spacing:0}
    .section-head p{font-size:18px;line-height:1.6;color:var(--muted);margin:0}
    .features{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
    .feature{padding:30px;border-radius:24px;background:var(--soft);border:1px solid var(--line);transition:transform .2s ease,box-shadow .2s ease}
    .feature:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(36,22,84,.1)}
    .feature-icon{display:grid;place-items:center;width:54px;height:54px;border-radius:16px;background:#fff;color:var(--pink);box-shadow:0 6px 16px rgba(36,22,84,.08)}
    .feature-icon svg{width:28px;height:28px}
    .feature h3{font-family:var(--display);font-size:21px;margin:20px 0 8px}
    .feature p{margin:0;line-height:1.65;color:var(--muted)}

    .how{background:linear-gradient(180deg,#FFF7F2,#FFF)}
    .steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;counter-reset:s}
    .step{position:relative;padding:34px 30px;border-radius:24px;background:#fff;border:1px solid #F5E3D8;box-shadow:0 12px 30px rgba(255,138,61,.08)}
    .step-num{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,var(--pink),var(--orange));color:#fff;font-weight:800;font-size:19px}
    .step h3{font-family:var(--display);font-size:24px;margin:18px 0 8px}
    .step p{margin:0;line-height:1.65;color:var(--muted)}

    .showcase-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:28px}
    .screen{margin:0;text-align:center}
    .screen:nth-child(even){transform:translateY(36px)}
    .screen figcaption{margin-top:18px;font-weight:700;font-size:16px}

    .host{background:var(--plum);color:#fff;position:relative;overflow:hidden}
    .host::after{content:"";position:absolute;width:520px;height:520px;border-radius:50%;inset-inline-end:-160px;top:-160px;background:radial-gradient(circle,rgba(214,31,99,.6),transparent 65%)}
    .host .wrap{position:relative;z-index:1;display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center}
    .host h2{font-family:var(--display);font-size:clamp(30px,3.6vw,44px);line-height:1.12;letter-spacing:-.03em;margin:0 0 16px}
    .host p{font-size:18px;line-height:1.65;color:rgba(255,255,255,.82);margin:0 0 28px}
    .host ul{list-style:none;margin:0;padding:0;display:grid;gap:14px}
    .host li{display:flex;gap:14px;align-items:center;padding:18px 20px;border-radius:18px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);font-weight:600;font-size:16px}
    .host li::before{content:"✓";display:grid;place-items:center;flex:none;width:30px;height:30px;border-radius:50%;background:var(--gold);color:var(--plum);font-weight:800}

    .download .wrap{display:grid;grid-template-columns:1.2fr .8fr;gap:24px}
    .download-card{padding:56px;border-radius:32px;color:#fff;background:linear-gradient(135deg,#7A1E6C,var(--pink) 55%,var(--orange));position:relative;overflow:hidden}
    .download-card img.mark{position:absolute;width:220px;inset-inline-end:-30px;bottom:-40px;opacity:.18;transform:rotate(-12deg)}
    .download h2{font-family:var(--display);font-size:clamp(32px,4vw,48px);letter-spacing:-.03em;margin:0 0 14px}
    .download-card p{font-size:18px;line-height:1.6;color:rgba(255,255,255,.9);margin:0 0 30px;max-width:520px}
    .badges{display:flex;flex-wrap:wrap;gap:14px;position:relative}
    .store-badge{display:inline-flex;align-items:center;gap:12px;min-width:200px;padding:12px 22px;border-radius:16px;background:#000;color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.2);transition:transform .15s ease}
    a.store-badge:hover{transform:translateY(-2px)}
    .store-badge svg{width:30px;height:30px;flex:none}
    .badge-text{display:flex;flex-direction:column;line-height:1.15;text-align:start}
    .badge-text small{font-size:12px;opacity:.85}
    .badge-text strong{font-size:21px;font-weight:700;letter-spacing:-.01em}
    .store-badge.is-soon{cursor:default}
    .store-badge.is-soon small{color:var(--gold);opacity:1;font-weight:700}
    .web-card{padding:44px;border-radius:32px;background:var(--soft);border:1px solid var(--line);display:flex;flex-direction:column;justify-content:center}
    .web-card .browser{border-radius:14px;background:#fff;border:1px solid var(--line);padding:12px 14px;display:flex;align-items:center;gap:8px;margin-bottom:26px;font-size:14px;color:var(--muted)}
    .web-card .browser i{width:10px;height:10px;border-radius:50%;background:#FF5F57}
    .web-card .browser i:nth-child(2){background:#FEBC2E}.web-card .browser i:nth-child(3){background:#28C840}
    .web-card h3{font-family:var(--display);font-size:28px;margin:0 0 10px}
    .web-card p{line-height:1.6;color:var(--muted);margin:0 0 26px;font-size:17px}
    .web-card .btn{align-self:flex-start}

    footer{background:#0F0A26;color:rgba(255,255,255,.75);padding:48px 0}
    footer .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px}
    footer .brand span{color:#fff;font-size:22px}
    footer .brand img{width:38px;height:38px}
    footer nav{display:flex;flex-wrap:wrap;gap:20px;font-size:15px}
    footer nav a{text-decoration:none}
    footer nav a:hover{color:#fff}
    footer .fine{width:100%;border-top:1px solid rgba(255,255,255,.1);padding-top:20px;font-size:14px}

    @media (max-width:980px){
      .hero-grid,.host .wrap,.download .wrap{grid-template-columns:1fr}
      .hero-grid{padding:24px 0 72px;text-align:center}
      .hero p.lead{margin-inline:auto}
      .cta-row{justify-content:center}
      .hero-phones{height:520px;max-width:520px;margin:0 auto;width:100%}
      .hero-phones .phone{width:230px}
      .features,.steps{grid-template-columns:1fr 1fr}
      .showcase-grid{grid-template-columns:1fr 1fr}
      .screen:nth-child(even){transform:none}
    }
    @media (max-width:640px){
      .wrap{padding:0 18px}
      .nav-links a:not(.nav-cta):not(.lang){display:none}
      section{padding:68px 0}
      .features,.steps{grid-template-columns:1fr}
      .showcase-grid{gap:16px}
      .hero-phones{height:420px}
      .hero-phones .phone{width:180px;border-radius:28px;padding:7px}
      .hero-phones .phone img{border-radius:22px}
      .ticket-chip{bottom:8px;font-size:14px}
      .download-card,.web-card{padding:32px 24px}
      .store-badge{min-width:0;flex:1 1 180px}
      .btn{width:100%}
      .web-card .btn{align-self:stretch}
    }
  </style>
</head>
<body>
  <header class="hero">
    <div class="wrap">
      <nav class="nav">
        <a class="brand" href="/welcome?lang=${language}"><img src="/welcome/assets/logo-mark.png" alt=""><span>Migo</span></a>
        <div class="nav-links">
          <a href="/">${escapeHtml(c.navWebsite)}</a>
          <a class="lang" href="/welcome?lang=${other}">${escapeHtml(c.switchLabel)}</a>
          <a class="nav-cta" href="#download">${escapeHtml(c.navDownload)}</a>
        </div>
      </nav>
      <div class="hero-grid">
        <div>
          <span class="eyebrow">${escapeHtml(c.eyebrow)}</span>
          <h1>${escapeHtml(c.heroTitle)}<span class="grad-text">${escapeHtml(c.heroAccent)}</span></h1>
          <p class="lead">${escapeHtml(c.heroBody)}</p>
          <div class="cta-row">
            <a class="btn btn-primary" href="/">${escapeHtml(c.ctaWebsite)}</a>
            <a class="btn btn-ghost" href="#download">${escapeHtml(c.ctaDownload)}</a>
          </div>
          <p class="hero-note">${escapeHtml(c.heroNote)}</p>
        </div>
        <div class="hero-phones" aria-hidden="true">
          <div class="glow"></div>
          <div class="phone p1"><img src="/welcome/assets/screen-wallet.jpg" alt=""></div>
          <div class="phone p2"><img src="/welcome/assets/screen-home.jpg" alt=""></div>
          <div class="ticket-chip"><b>✓</b><span>${language === 'ar' ? 'تم تسجيل الحضور' : 'Checked in'}<small>${language === 'ar' ? 'تذكرتك جاهزة في المحفظة' : 'Your ticket is in your wallet'}</small></span></div>
        </div>
      </div>
    </div>
  </header>

  <div class="sources"><div class="wrap"><p>${escapeHtml(c.sourcesLabel)}</p>${sources}</div></div>

  <section id="features">
    <div class="wrap">
      <div class="section-head"><h2>${escapeHtml(c.featuresTitle)}</h2><p>${escapeHtml(c.featuresBody)}</p></div>
      <div class="features">${features}</div>
    </div>
  </section>

  <section class="how">
    <div class="wrap">
      <div class="section-head"><h2>${escapeHtml(c.stepsTitle)}</h2></div>
      <ol class="steps">${steps}</ol>
    </div>
  </section>

  <section>
    <div class="wrap">
      <div class="section-head"><h2>${escapeHtml(c.showcaseTitle)}</h2><p>${escapeHtml(c.showcaseBody)}</p></div>
      <div class="showcase-grid">${screens}</div>
    </div>
  </section>

  <section class="host">
    <div class="wrap">
      <div>
        <h2>${escapeHtml(c.hostTitle)}</h2>
        <p>${escapeHtml(c.hostBody)}</p>
        <a class="btn btn-light" href="/">${escapeHtml(c.hostCta)}</a>
      </div>
      <ul>${hostPoints}</ul>
    </div>
  </section>

  <section class="download" id="download">
    <div class="wrap">
      <div class="download-card">
        <img class="mark" src="/welcome/assets/logo-mark.png" alt="">
        <h2>${escapeHtml(c.downloadTitle)}</h2>
        <p>${escapeHtml(c.downloadBody)}</p>
        <div class="badges">${appStore}${playStore}</div>
      </div>
      <div class="web-card">
        <div class="browser"><i></i><i></i><i></i><span>migo · ${language === 'ar' ? 'اكتشف' : 'Discover'}</span></div>
        <h3>${escapeHtml(c.websiteCardTitle)}</h3>
        <p>${escapeHtml(c.websiteCardBody)}</p>
        <a class="btn btn-primary" href="/">${escapeHtml(c.websiteCardCta)}</a>
      </div>
    </div>
  </section>

  <footer>
    <div class="wrap">
      <a class="brand" href="/welcome?lang=${language}"><img src="/welcome/assets/logo-mark.png" alt=""><span>Migo</span></a>
      <span>${escapeHtml(c.footerTagline)}</span>
      <nav>
        <a href="/privacy?lang=${language}">${escapeHtml(c.privacy)}</a>
        <a href="/terms?lang=${language}">${escapeHtml(c.terms)}</a>
        <a href="mailto:${escapeHtml(config.SUPPORT_EMAIL)}">${escapeHtml(c.contact)}</a>
      </nav>
      <div class="fine">© ${new Date().getFullYear()} ${escapeHtml(c.rights)}</div>
    </div>
  </footer>
</body>
</html>`;
};

const router = Router();

router.use('/welcome/assets', express.static(path.resolve(__dirname, '../../public/welcome'), { maxAge: '7d' }));

router.get('/welcome', (req: Request, res: Response) => {
  const language: Language = req.query.lang === 'ar' ? 'ar' : 'en';
  res.type('html').send(renderWelcome(language));
});

export { router as marketingRouter };
