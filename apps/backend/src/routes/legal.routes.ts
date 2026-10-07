import { Router, Request, Response } from 'express';
import config from '../config/env';

type LegalPage = 'privacy' | 'terms' | 'delete-account';
type Language = 'en' | 'ar';
type LegalSection = { heading: string; paragraphs: string[]; bullets?: string[] };
type LegalCopy = { title: string; intro: string; sections: LegalSection[] };

const router = Router();

const copy: Record<Language, Record<LegalPage, LegalCopy>> = {
  en: {
    privacy: {
      title: 'Privacy Policy',
      intro: 'This notice explains how Migo handles personal information when you use our event discovery, booking, organizer and community services.',
      sections: [
        {
          heading: 'Information we collect',
          paragraphs: [
            'We collect account information such as your name, email address, phone number, password hash or sign-in method, role, interests, language and other preferences. You may add profile text, a profile photo, a cover photo and event content.',
            'When you use booking features, we process event, ticket, booking and payment status details, contact information needed to fulfil a booking, and customer-support communications. Stripe processes card payments for Migo checkout; Migo does not store full card numbers or card security codes.',
            'With your permission, the app may use your device location while you are using it to show nearby events. We do not use background location tracking. We also process event views, searches, saved events and outbound clicks to understand product use, personalize discovery and measure referrals. Security and click-out records may include a truncated user agent and a one-way hashed IP address.',
            'The web app stores essential session and preference data in browser local storage. The mobile app stores session and preference data on-device, using secure device storage for authentication tokens where supported. Migo does not currently use advertising cookies; hosting, payment or linked third-party pages may use their own essential cookies or similar technologies.',
          ],
        },
        {
          heading: 'How we use information',
          paragraphs: [],
          bullets: [
            'Create and secure accounts, provide event discovery, social features, bookings, tickets and support.',
            'Personalize recommendations and remember language, interests, saved events and reminder preferences.',
            'Send booking, security and service messages by email or, when you opt in and provide a number, WhatsApp. Verification or service SMS may be sent where needed.',
            'Measure product performance, event views, searches and referral clicks; detect fraud, abuse and security incidents; and meet legal, tax and accounting obligations.',
          ],
        },
        {
          heading: 'AI chat and connected services',
          paragraphs: [
            'If you use Ask Migo, the text you submit and relevant conversation context may be sent to Google Gemini to generate a response. Do not include payment-card details or information you do not want processed by that service. Google processes this information under its own terms and privacy practices.',
            'Depending on the feature and configuration, our service providers include Stripe for payments; Google Maps and mapping/geocoding services for maps and places; WhatsApp/Meta for opted-in reminders; Twilio for SMS; SendGrid or configured SMTP providers for email; and cloud, database and push-notification infrastructure. These providers process information only as needed to provide their services to Migo.',
          ],
        },
        {
          heading: 'Events and third-party providers',
          paragraphs: [
            'Event listings and booking links may be supplied by event organizers, venues and ticketing partners, including Visit Dubai, Visit Abu Dhabi, Visit Sharjah, UAE Government, Expo City Dubai, Dubai World Trade Centre, Dubai Exhibition Centre, Expo Centre Sharjah, ADNEC Centre Abu Dhabi, Yas Island, Alserkal Avenue, Abu Dhabi Festival, DIFC, MyDubai Communities, Heart of RAK, MyAlAin, Ticketmaster, Luma and Eventbrite. A booking completed on a third-party site is governed by that provider’s privacy notice and terms. We may share the information necessary with the organizer or ticket provider to fulfil a booking or respond to a support request.',
            'When you follow an outbound booking link, the destination site may receive your browser or device information and may set its own cookies. Migo may record the referral and event for attribution and reporting.',
          ],
        },
        {
          heading: 'Retention and account deletion',
          paragraphs: [
            'We keep account and profile information while your account is active. You can request deletion in Account settings or at the instructions on our Delete account page. We remove or anonymize profile and social information and revoke sign-in tokens. Past bookings, payment records and related financial information may be retained for accounting, dispute resolution, fraud prevention and legal obligations. Limited backups and security logs may persist for a reasonable period before they are rotated or deleted.',
            'On account deletion, we also delete linked search history, event-view records, personalization signals and AI chat history. Aggregated event and referral counts may remain without direct account identifiers.',
            'You may contact us to request access, correction or deletion of personal information, subject to applicable legal and operational retention requirements.',
          ],
        },
        {
          heading: 'UAE privacy rights and contact',
          paragraphs: [
            'Migo handles personal information in accordance with applicable UAE law, including Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data (UAE PDPL), where applicable. You may have rights to access, correct, erase, restrict or object to certain processing, and to withdraw consent where processing relies on consent.',
            `For privacy questions or requests, contact ${config.SUPPORT_EMAIL}.`,
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of Service',
      intro: 'These terms govern your use of Migo’s event discovery, booking, organizer and supplier services.',
      sections: [
        {
          heading: 'Accounts and roles',
          paragraphs: [
            'Provide accurate account information, keep your credentials secure and promptly report unauthorized use. You are responsible for activity under your account. Migo may provide attendee, organizer, supplier and administrator roles; a role enables product features and does not make Migo your agent or business partner.',
          ],
        },
        {
          heading: 'Events, bookings and organizers',
          paragraphs: [
            'Event details may be provided by organizers, venues or third-party listing and ticketing providers. Check event details, eligibility, location, timing and ticket conditions before purchasing. Unless an event is expressly hosted and sold by Migo, the event organizer—not Migo—is responsible for delivering the event, admission, schedule, safety, cancellations and refunds.',
            'Booking, cancellation, refund, admission and transfer rules are set by the organizer or ticketing provider and are shown at checkout or on the provider’s site. If you leave Migo to complete a booking, that provider’s terms and privacy notice also apply. Contact the responsible organizer or ticket provider about event changes and refunds.',
          ],
        },
        {
          heading: 'Payments and paid plans',
          paragraphs: [
            'Prices, plan duration, included features and any renewal or cancellation terms are presented before purchase. Paid plans are subject to those disclosed terms; access may change or expire when a plan ends or a subscription is cancelled. Payments for Migo checkout are processed by Stripe. Migo does not store full payment-card details.',
          ],
        },
        {
          heading: 'Acceptable use and moderation',
          paragraphs: [
            'Do not use Migo to break the law, infringe rights, harass or threaten people, distribute deceptive or harmful material, manipulate bookings or reviews, scrape or disrupt the service, or upload content you are not entitled to share. You retain rights to your content and grant Migo the limited licence needed to host, display and operate the service.',
            'We may remove content, restrict features, pause or terminate accounts, or cancel access when reasonably necessary to protect users, enforce these terms or comply with law. We may investigate reports and cooperate with lawful requests.',
          ],
        },
        {
          heading: 'Third-party services and availability',
          paragraphs: [
            'Migo links to independent organizers, venues, ticket providers, maps and other services. We do not control or guarantee their content, availability or actions. The service and event information are provided on an “as available” basis, subject to mandatory consumer rights under applicable law.',
          ],
        },
        {
          heading: 'Liability and governing law',
          paragraphs: [
            'To the maximum extent permitted by applicable law, Migo is not responsible for indirect or consequential loss, third-party events or services, or inaccuracies supplied by event providers. Nothing in these terms excludes liability that cannot legally be excluded or limits mandatory consumer protections.',
            'These terms are governed by the laws of the United Arab Emirates. Disputes are subject to the competent courts of the UAE, without limiting any mandatory rights you may have under applicable law.',
          ],
        },
        {
          heading: 'Contact',
          paragraphs: [`Questions about these terms: ${config.SUPPORT_EMAIL}.`],
        },
      ],
    },
    'delete-account': {
      title: 'Delete your account',
      intro: 'You can request deletion from the Migo app or contact support.',
      sections: [
        {
          heading: 'In the app',
          paragraphs: [],
          bullets: [
            'Open Profile, then Account settings.',
            'Choose Delete account and review the confirmation message.',
            'Confirm with your password when requested. If you have upcoming paid bookings or are hosting an event with confirmed guests, resolve those bookings or events first.',
          ],
        },
        {
          heading: 'What deletion does',
          paragraphs: [
            'Deletion disables sign-in, removes or anonymizes profile information and deletes social connections, saved events, notifications, reviews and other account features. Active or pending subscriptions are cancelled, and future free bookings are cancelled.',
            'Linked searches, event views, personalization signals and AI chat history are also deleted. Referral reporting may retain aggregate, de-identified counts.',
            'Past booking and payment records may be retained where needed for accounting, legal compliance, fraud prevention or dispute resolution. A deletion request does not cancel an event ticket automatically; contact the event organizer or ticket provider about a refund.',
          ],
        },
        {
          heading: 'Need help?',
          paragraphs: [`Email ${config.SUPPORT_EMAIL} from the address or phone number associated with your account. We may ask you to verify that you own the account before processing a request.`],
        },
      ],
    },
  },
  ar: {
    privacy: {
      title: 'سياسة الخصوصية',
      intro: 'توضح هذه السياسة كيفية تعامل Migo مع بياناتك الشخصية عند استخدام خدمات اكتشاف الفعاليات والحجز والمنظمين والمجتمع.',
      sections: [
        {
          heading: 'المعلومات التي نجمعها',
          paragraphs: [
            'نجمع معلومات الحساب مثل الاسم والبريد الإلكتروني ورقم الهاتف وتجزئة كلمة المرور أو طريقة تسجيل الدخول والدور والاهتمامات واللغة والتفضيلات. ويمكنك إضافة نبذة وصورة للملف الشخصي وصورة غلاف ومحتوى للفعاليات.',
            'عند استخدام الحجز، نعالج معلومات الفعالية والتذاكر والحجز وحالة الدفع وبيانات الاتصال اللازمة لتنفيذ الحجز ومراسلات الدعم. تعالج Stripe مدفوعات البطاقات عبر Migo، ولا نخزن أرقام البطاقات الكاملة أو رموز أمانها.',
            'بموافقتك، قد يستخدم التطبيق موقع جهازك أثناء استخدامه لعرض الفعاليات القريبة. لا نتتبع موقعك في الخلفية. كما نعالج مشاهدات الفعاليات وعمليات البحث والفعاليات المحفوظة والنقرات على الروابط الخارجية لفهم استخدام الخدمة وتخصيص الاكتشاف وقياس الإحالات. وقد تتضمن سجلات الأمان والنقرات جزءاً من معلومات المتصفح وعنوان IP مجزأً أحادي الاتجاه.',
            'يخزن إصدار الويب بيانات الجلسة والتفضيلات الأساسية في مساحة التخزين المحلية للمتصفح. ويخزن تطبيق الهاتف بيانات الجلسة والتفضيلات على الجهاز، مع استخدام التخزين الآمن لرموز المصادقة حيثما كان ذلك مدعوماً. لا يستخدم Migo حالياً ملفات تعريف ارتباط إعلانية؛ وقد تستخدم صفحات الاستضافة أو الدفع أو الجهات الخارجية المرتبطة ملفاتها الضرورية الخاصة.',
          ],
        },
        {
          heading: 'كيف نستخدم المعلومات',
          paragraphs: [],
          bullets: [
            'إنشاء الحسابات وتأمينها وتوفير اكتشاف الفعاليات والميزات الاجتماعية والحجوزات والتذاكر والدعم.',
            'تخصيص التوصيات وحفظ اللغة والاهتمامات والفعاليات المحفوظة وتفضيلات التذكير.',
            'إرسال رسائل الحجز والأمان والخدمة عبر البريد الإلكتروني أو واتساب عند الاشتراك وتقديم رقم هاتف. وقد نرسل رسائل SMS للتحقق أو الخدمة عند الحاجة.',
            'قياس أداء المنتج ومشاهدات الفعاليات وعمليات البحث ونقرات الإحالة، واكتشاف الاحتيال وإساءة الاستخدام ومشكلات الأمان، والوفاء بالالتزامات القانونية والضريبية والمحاسبية.',
          ],
        },
        {
          heading: 'المحادثة بالذكاء الاصطناعي والخدمات المرتبطة',
          paragraphs: [
            'إذا استخدمت «اسأل Migo»، فقد نرسل النص الذي تقدمه وسياق المحادثة ذي الصلة إلى Google Gemini لإنشاء إجابة. لا ترسل بيانات بطاقتك أو معلومات لا ترغب في معالجتها عبر تلك الخدمة. تعالج Google هذه المعلومات وفق شروطها وممارسات الخصوصية الخاصة بها.',
            'بحسب الميزة والإعدادات، تشمل الجهات التي تقدم الخدمات لنا Stripe للمدفوعات، وGoogle Maps وخدمات الخرائط وتحديد المواقع، وWhatsApp/Meta للتذكيرات التي اشتركت بها، وTwilio لرسائل SMS، وSendGrid أو مزودي SMTP للبريد الإلكتروني، والبنية التحتية السحابية وقواعد البيانات والإشعارات. تعالج هذه الجهات المعلومات بالقدر اللازم لتقديم خدماتها إلى Migo.',
          ],
        },
        {
          heading: 'الفعاليات والجهات الخارجية',
          paragraphs: [
            'قد تأتي قوائم الفعاليات وروابط الحجز من المنظمين والأماكن وشركاء التذاكر، بما في ذلك Visit Dubai وVisit Abu Dhabi وVisit Sharjah وحكومة الإمارات ومدينة إكسبو دبي ومركز دبي التجاري العالمي ومركز دبي للمعارض ومركز إكسبو الشارقة ومركز أدنيك أبوظبي وHeart of RAK وMyAlAin وجزيرة ياس والسركال أفنيو ومهرجان أبوظبي وDIFC ومجتمعات دبي وTicketmaster وLuma وEventbrite. يخضع الحجز الذي يتم على موقع جهة خارجية لإشعار الخصوصية وشروط تلك الجهة. وقد نشارك المعلومات اللازمة مع المنظم أو مزود التذاكر لتنفيذ الحجز أو الرد على طلب دعم.',
            'عند فتح رابط حجز خارجي، قد يحصل الموقع الوجهة على معلومات المتصفح أو الجهاز وقد يضع ملفات تعريف الارتباط الخاصة به. وقد يسجل Migo الإحالة والفعالية لأغراض الإسناد والتقارير.',
          ],
        },
        {
          heading: 'الاحتفاظ بالبيانات وحذف الحساب',
          paragraphs: [
            'نحتفظ بمعلومات الحساب والملف الشخصي ما دام الحساب نشطاً. يمكنك طلب الحذف من إعدادات الحساب أو اتباع التعليمات في صفحة حذف الحساب. نحذف معلومات الملف والبيانات الاجتماعية أو نجعلها مجهولة ونعطل رموز تسجيل الدخول. وقد نحتفظ بسجلات الحجوزات والمدفوعات السابقة والمعلومات المالية ذات الصلة للمحاسبة وتسوية النزاعات ومنع الاحتيال والوفاء بالالتزامات القانونية. وقد تبقى نسخ احتياطية محدودة وسجلات أمان لفترة معقولة قبل تدويرها أو حذفها.',
            'عند حذف الحساب، نحذف أيضاً سجل البحث ومشاهدات الفعاليات وإشارات التخصيص وسجل محادثات الذكاء الاصطناعي المرتبطة به. وقد تبقى إحصاءات إجمالية للفعاليات والإحالات دون معرّفات مباشرة للحساب.',
            'يمكنك التواصل معنا لطلب الوصول إلى معلوماتك الشخصية أو تصحيحها أو حذفها، مع مراعاة متطلبات الاحتفاظ القانونية والتشغيلية.',
          ],
        },
        {
          heading: 'حقوق الخصوصية في الإمارات والتواصل',
          paragraphs: [
            'يتعامل Migo مع المعلومات الشخصية وفق القوانين الإماراتية السارية، بما فيها المرسوم بقانون اتحادي رقم 45 لسنة 2021 بشأن حماية البيانات الشخصية (قانون حماية البيانات الشخصية الإماراتي) حيثما ينطبق. وقد تشمل حقوقك الوصول إلى بياناتك أو تصحيحها أو محوها أو تقييد معالجتها أو الاعتراض على بعض المعالجة وسحب الموافقة عندما تستند المعالجة إلى الموافقة.',
            `للاستفسارات أو الطلبات المتعلقة بالخصوصية، تواصل عبر ${config.SUPPORT_EMAIL}.`,
          ],
        },
      ],
    },
    terms: {
      title: 'شروط الخدمة',
      intro: 'تنظم هذه الشروط استخدام خدمات Migo لاكتشاف الفعاليات والحجز والمنظمين والمزودين.',
      sections: [
        {
          heading: 'الحسابات والأدوار',
          paragraphs: [
            'قدّم معلومات حساب دقيقة، وحافظ على سرية بيانات الدخول، وأبلغنا سريعاً عن أي استخدام غير مصرح به. أنت مسؤول عن النشاط الذي يتم عبر حسابك. قد يوفر Migo أدواراً للحضور والمنظمين والمزودين والإدارة؛ ويتيح الدور ميزات المنتج ولا يجعل Migo وكيلاً عنك أو شريكاً تجارياً.',
          ],
        },
        {
          heading: 'الفعاليات والحجوزات والمنظمون',
          paragraphs: [
            'قد يقدم تفاصيل الفعاليات المنظمون أو الأماكن أو مزودو القوائم والتذاكر من جهات خارجية. تحقق من التفاصيل والأهلية والموقع والوقت وشروط التذاكر قبل الشراء. ما لم تكن الفعالية مستضافة ومباعة صراحةً عبر Migo، يكون المنظم، وليس Migo، مسؤولاً عن إقامة الفعالية والدخول والجدول والسلامة والإلغاء والاسترداد.',
            'يحدد المنظم أو مزود التذاكر قواعد الحجز والإلغاء والاسترداد والدخول ونقل التذاكر، وتظهر عند الدفع أو على موقع المزود. إذا غادرت Migo لإكمال الحجز، تسري أيضاً شروط المزود وإشعار الخصوصية الخاص به. تواصل مع المنظم أو مزود التذاكر المسؤول بشأن تغييرات الفعالية والاسترداد.',
          ],
        },
        {
          heading: 'المدفوعات والخطط المدفوعة',
          paragraphs: [
            'تُعرض الأسعار ومدة الخطة والميزات المشمولة وأي شروط للتجديد أو الإلغاء قبل الشراء. تخضع الخطط المدفوعة للشروط المعروضة؛ وقد يتغير الوصول إلى الميزات أو ينتهي عند انتهاء الخطة أو إلغائها. تعالج Stripe مدفوعات الشراء عبر Migo. لا يخزن Migo بيانات البطاقة كاملة.',
          ],
        },
        {
          heading: 'الاستخدام المقبول والإشراف',
          paragraphs: [
            'لا تستخدم Migo لمخالفة القانون أو انتهاك الحقوق أو مضايقة الأشخاص أو تهديدهم أو نشر محتوى مضلل أو ضار أو التلاعب بالحجوزات أو التقييمات أو تعطيل الخدمة أو جمع بياناتها آلياً أو رفع محتوى لا تملك حق مشاركته. تحتفظ بحقوق محتواك وتمنح Migo ترخيصاً محدوداً لاستضافته وعرضه وتشغيل الخدمة.',
            'يجوز لنا إزالة المحتوى أو تقييد الميزات أو إيقاف الحساب مؤقتاً أو إنهاؤه عندما يكون ذلك ضرورياً بشكل معقول لحماية المستخدمين أو تطبيق هذه الشروط أو الامتثال للقانون. وقد نحقق في البلاغات ونتعاون مع الطلبات القانونية.',
          ],
        },
        {
          heading: 'الخدمات الخارجية والتوفر',
          paragraphs: [
            'يربط Migo بخدمات مستقلة للمنظمين والأماكن ومزودي التذاكر والخرائط وغيرها. لا نتحكم في محتواها أو توفرها أو تصرفاتها ولا نضمنها. تقدم الخدمة ومعلومات الفعاليات حسب التوفر، مع مراعاة حقوق المستهلك الإلزامية بموجب القانون الساري.',
          ],
        },
        {
          heading: 'المسؤولية والقانون الحاكم',
          paragraphs: [
            'إلى أقصى حد يسمح به القانون الساري، لا يتحمل Migo مسؤولية الخسائر غير المباشرة أو التبعية أو الفعاليات والخدمات الخارجية أو الأخطاء التي تقدمها الجهات المنظمة. لا تستبعد هذه الشروط أي مسؤولية لا يجوز استبعادها قانوناً ولا تحد من حقوق المستهلك الإلزامية.',
            'تخضع هذه الشروط لقوانين دولة الإمارات العربية المتحدة. وتختص المحاكم المختصة في الدولة بالنزاعات، دون المساس بأي حقوق إلزامية قد تتمتع بها بموجب القانون الساري.',
          ],
        },
        {
          heading: 'التواصل',
          paragraphs: [`للاستفسار عن هذه الشروط: ${config.SUPPORT_EMAIL}.`],
        },
      ],
    },
    'delete-account': {
      title: 'حذف الحساب',
      intro: 'يمكنك طلب الحذف من تطبيق Migo أو التواصل مع الدعم.',
      sections: [
        {
          heading: 'من داخل التطبيق',
          paragraphs: [],
          bullets: [
            'افتح الملف الشخصي، ثم إعدادات الحساب.',
            'اختر حذف الحساب وراجع رسالة التأكيد.',
            'أكّد باستخدام كلمة المرور عند طلبها. إذا كانت لديك حجوزات مدفوعة قادمة أو كنت تستضيف فعالية لديها ضيوف مؤكّدون، فعليك تسوية تلك الحجوزات أو الفعاليات أولاً.',
          ],
        },
        {
          heading: 'ما الذي يترتب على الحذف؟',
          paragraphs: [
            'يوقف الحذف تسجيل الدخول، ويحذف معلومات الملف الشخصي أو يجعلها مجهولة، ويحذف الروابط الاجتماعية والفعاليات المحفوظة والإشعارات والتقييمات وغيرها من ميزات الحساب. كما تُلغى الاشتراكات النشطة أو المعلقة والحجوزات المجانية القادمة.',
            'كما يُحذف سجل البحث ومشاهدات الفعاليات وإشارات التخصيص ومحادثات الذكاء الاصطناعي المرتبطة بالحساب. وقد تبقى أعداد إجمالية مجهولة للإحالات.',
            'قد نحتفظ بسجلات الحجوزات والمدفوعات السابقة عند الحاجة للمحاسبة أو الامتثال القانوني أو منع الاحتيال أو تسوية النزاعات. لا يؤدي حذف الحساب تلقائياً إلى إلغاء تذكرة فعالية؛ تواصل مع المنظم أو مزود التذاكر بشأن الاسترداد.',
          ],
        },
        {
          heading: 'هل تحتاج إلى مساعدة؟',
          paragraphs: [`أرسل بريداً إلى ${config.SUPPORT_EMAIL} من العنوان أو رقم الهاتف المرتبط بحسابك. وقد نطلب منك إثبات ملكية الحساب قبل تنفيذ الطلب.`],
        },
      ],
    },
  },
};

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderPage = (page: LegalPage, language: Language): string => {
  const content = copy[language][page];
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const switchLabel = language === 'ar' ? 'English' : 'العربية';
  const sections = content.sections.map(section => `
    <section>
      <h2>${escapeHtml(section.heading)}</h2>
      ${section.paragraphs?.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('') || ''}
      ${section.bullets ? `<ul>${section.bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    </section>
  `).join('');

  return `<!doctype html>
<html lang="${language}" dir="${direction}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(content.title)} · Migo</title>
  <style>
    :root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20202a;background:#f8f7fb}
    *{box-sizing:border-box}
    body{margin:0;padding:28px 16px 48px}
    main{max-width:820px;margin:0 auto;background:#fff;border:1px solid #ece9f2;border-radius:22px;padding:clamp(22px,5vw,48px);box-shadow:0 12px 42px rgba(35,25,56,.07)}
    header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #eeeaf3;padding-bottom:22px;margin-bottom:26px}
    .brand{font-size:16px;font-weight:800;letter-spacing:.02em;color:#7d3fe2}
    .language{font-size:14px;font-weight:700;color:#6930c3;text-decoration:none}
    h1{font-size:clamp(28px,6vw,40px);line-height:1.15;margin:0 0 12px;letter-spacing:-.03em}
    .intro{font-size:17px;line-height:1.7;color:#585666;margin:0 0 30px}
    section{margin:26px 0}
    h2{font-size:20px;margin:0 0 10px;color:#292735}
    p,li{font-size:15px;line-height:1.8;color:#555361}
    p{margin:8px 0}
    ul{padding-inline-start:24px;margin:8px 0}
    footer{border-top:1px solid #eeeaf3;padding-top:20px;margin-top:32px;color:#686675;font-size:14px;line-height:1.7}
    a{color:#6930c3}
    @media(max-width:520px){body{padding:12px 10px 30px}main{border-radius:16px;padding:22px 18px}}
  </style>
</head>
<body>
  <main>
    <header><span class="brand">MIGO</span><a class="language" href="/${page}?lang=${language === 'ar' ? 'en' : 'ar'}">${switchLabel}</a></header>
    <h1>${escapeHtml(content.title)}</h1>
    <p class="intro">${escapeHtml(content.intro)}</p>
    ${sections}
    <footer><a href="/privacy?lang=${language}">${language === 'ar' ? 'سياسة الخصوصية' : 'Privacy'}</a> · <a href="/terms?lang=${language}">${language === 'ar' ? 'الشروط' : 'Terms'}</a> · <a href="/delete-account?lang=${language}">${language === 'ar' ? 'حذف الحساب' : 'Delete account'}</a><br>${language === 'ar' ? 'للتواصل:' : 'Contact:'} <a href="mailto:${escapeHtml(config.SUPPORT_EMAIL)}">${escapeHtml(config.SUPPORT_EMAIL)}</a></footer>
  </main>
</body>
</html>`;
};

router.get(['/privacy', '/terms', '/delete-account'], (req: Request, res: Response) => {
  const page = req.path.slice(1) as LegalPage;
  const language: Language = req.query.lang === 'ar' ? 'ar' : 'en';
  res.type('html').send(renderPage(page, language));
});

export { router as legalRouter };
