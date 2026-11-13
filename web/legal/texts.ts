/**
 * The terms and the privacy policy per base language, as light markdown: "## " a heading, "- " a list item, an empty
 * line a new paragraph. {name}, {kvk}, {vat}, {address}, {email} and {updated} are filled in from company.ts.
 * A first version written for Qissio; have it read by a lawyer before relying on it (docs/stripe.md).
 */

type Texts = { terms: string; privacy: string; titles: { terms: string; privacy: string }; updated: string };

const nl: Texts = {
  titles: { terms: "Algemene voorwaarden", privacy: "Privacyverklaring" },
  updated: "Bijgewerkt op {updated}",
  terms: `## Wie we zijn
Qissio is een app om talen te leren met korte verhalen. Qissio wordt aangeboden door {name}, {address}, ingeschreven bij de KvK onder nummer {kvk}, btw-nummer {vat}. Je bereikt ons via {email}.

## Gratis en Plus
Een deel van Qissio is gratis: per niveau een aantal verhalen en zinnen, met een dagelijkse limiet. Met Qissio Plus heb je alle verhalen, zinnen en herhalingen van één taal, zonder daglimiet. Wat precies gratis is, kunnen we aanpassen; wat je met Plus betaald hebt, blijft je hele betaalde periode beschikbaar.

## Een account
Om te betalen maak je een account met je e-mailadres; je logt in met een code die we je mailen. Houd de toegang tot je e-mail voor jezelf. Eén account is voor één persoon.

## Prijzen en betalen
De prijzen staan in de app en zijn inclusief btw. Je betaalt via Stripe, met de betaalmethoden die daar getoond worden. Een abonnement (per maand of per jaar) wordt aan het begin van elke periode automatisch betaald, tot je opzegt. Een prijswijziging melden we je minstens 30 dagen vooraf; je kunt dan opzeggen voordat de nieuwe prijs ingaat.

## Opzeggen
Je kunt je abonnement altijd opzeggen, via je account in de app ("Abonnement en facturen beheren"). Je houdt Plus dan tot het einde van de periode die je al betaald hebt; daarna wordt er niets meer afgeschreven. Voor een periode die al begonnen is, krijg je geen geld terug, tenzij de wet dat voorschrijft.

## Bedenktijd
Bij digitale inhoud heb je normaal 14 dagen bedenktijd. Plus begint direct na het betalen. Daarom vragen we je voor het betalen uitdrukkelijk of je wilt dat Plus meteen begint, en of je weet dat je daarmee afziet van je bedenktijd. Alleen als je dat bevestigt, kun je betalen.

## Wat we van je vragen
Gebruik Qissio voor jezelf en om te leren. Kopieer of verspreid de verhalen, beelden en opnames niet buiten de app, en probeer de app of de beveiliging niet te omzeilen. Doe je dat wel, dan mogen we je account blokkeren.

## Beschikbaarheid en aansprakelijkheid
We doen ons best om Qissio altijd goed te laten werken, maar we kunnen niet beloven dat het nooit even onbereikbaar is of nooit een fout bevat. Onze aansprakelijkheid is beperkt tot wat je in de twaalf maanden daarvoor aan ons betaald hebt, behalve bij opzet of grove nalatigheid.

## Wijzigingen
Als we deze voorwaarden wijzigen, staat de nieuwe versie hier met een nieuwe datum. Bij een wijziging die nadelig is voor jou laten we het je vooraf weten, en kun je opzeggen.

## Klachten en recht
Heb je een klacht, mail ons op {email}; we antwoorden binnen 14 dagen. Op deze voorwaarden is Nederlands recht van toepassing. Woon je in een ander EU-land, dan houd je de bescherming die het recht van jouw land je geeft.`,
  privacy: `## Kort
We verzamelen zo weinig mogelijk: wat nodig is om je te laten leren en, als je betaalt, om je abonnement te regelen. We verkopen niets door en gebruiken geen advertentiecookies. Verantwoordelijk is {name}, {address} ({email}).

## Wat we bewaren
- **Zonder account:** een anoniem nummer voor deze browser, je voortgang (welke verhalen, woorden en zinnen, je antwoorden en herhalingen), het niveau dat je koos, de taal van je apparaat, wanneer je er was, en via welke link of campagne je voor het eerst binnenkwam.
- **Met een account:** daarnaast je e-mailadres, en of je tips per e-mail wilt ontvangen (alleen als je dat zelf aanvinkt).
- **Als je betaalt:** wat je gekocht hebt, voor welke periode, en dat je hebt ingestemd met het direct starten van Plus. Je betaalgegevens (zoals je kaartnummer) gaan rechtstreeks naar Stripe; die zien wij niet.
- **Als je je op een wachtlijst zet:** je e-mailadres en voor welk product.

## Waarvoor
Om de app te laten werken en je voortgang te bewaren (uitvoering van onze overeenkomst met jou), om betalingen en facturen te regelen (overeenkomst en wettelijke plicht: facturen bewaren we 7 jaar), om te zien welke campagnes en pagina's werken en de app te verbeteren (gerechtvaardigd belang; alleen per groep, niet om jou te volgen), en om je tips te sturen als je daarvoor gekozen hebt (toestemming, die je altijd kunt intrekken in je account).

## Wie ons helpt
- **Supabase** (database en inloggen, servers in Frankfurt, EU)
- **Vercel** (de website)
- **Stripe** (betalingen; Stripe is voor betaalgegevens zelf ook verantwoordelijk)
- **Resend** (het versturen van de inlogcodes)

Met elk van hen hebben we afspraken over de bescherming van je gegevens. Waar gegevens buiten de EU komen, gebeurt dat met de waarborgen die de AVG vraagt.

## Cookies en opslag
We gebruiken alleen wat nodig is: je inlogsessie en een paar instellingen (zoals de stem en de richting van de zinnen) in je browser. Geen advertentie- of volgcookies.

## Hoe lang
Je voortgang en account bewaren we zolang je Qissio gebruikt. Een anoniem account dat 12 maanden niet gebruikt is, mogen we verwijderen. Verwijder je je account, dan wissen we je gegevens, behalve wat we volgens de wet moeten bewaren (zoals facturen).

## Je rechten
Je mag je gegevens inzien, laten verbeteren of verwijderen, bezwaar maken, je toestemming intrekken en een kopie van je gegevens krijgen. Mail daarvoor naar {email}; we antwoorden binnen een maand. Ben je het niet met ons eens, dan kun je een klacht indienen bij de Autoriteit Persoonsgegevens (of de toezichthouder in je eigen land).

## Kinderen
Qissio is bedoeld voor mensen van 16 jaar en ouder. Ben je jonger, vraag dan je ouder of verzorger om toestemming.`,
};

const en: Texts = {
  titles: { terms: "Terms of service", privacy: "Privacy policy" },
  updated: "Updated on {updated}",
  terms: `## Who we are
Qissio is an app for learning languages with short stories. Qissio is offered by {name}, {address}, registered with the Dutch Chamber of Commerce (KvK) under number {kvk}, VAT number {vat}. You can reach us at {email}.

## Free and Plus
Part of Qissio is free: a number of stories and phrases per level, with a daily limit. With Qissio Plus you get all stories, phrases and reviews of one language, without a daily limit. We may change what exactly is free; what you paid for with Plus stays available for your whole paid period.

## An account
To pay you create an account with your e-mail address; you log in with a code we e-mail you. Keep access to your e-mail to yourself. One account is for one person.

## Prices and paying
Prices are shown in the app and include VAT. You pay through Stripe, with the payment methods shown there. A subscription (monthly or yearly) is paid automatically at the start of each period until you cancel. We tell you about a price change at least 30 days in advance; you can cancel before the new price applies.

## Cancelling
You can cancel your subscription at any time, from your account in the app ("Manage subscription and invoices"). You keep Plus until the end of the period you already paid for; after that nothing more is charged. A period that has started is not refunded, unless the law requires it.

## Right of withdrawal
For digital content you normally have 14 days to withdraw. Plus starts right after payment. That is why, before you pay, we ask you explicitly whether you want Plus to start at once and whether you understand that you give up your right of withdrawal. You can only pay after confirming this.

## What we ask of you
Use Qissio for yourself and for learning. Do not copy or spread the stories, images and recordings outside the app, and do not try to get around the app or its security. If you do, we may block your account.

## Availability and liability
We do our best to keep Qissio working well, but we cannot promise it is never briefly unavailable or never contains an error. Our liability is limited to what you paid us in the twelve months before, except in case of intent or gross negligence.

## Changes
When we change these terms, the new version is published here with a new date. For a change that is to your disadvantage we tell you in advance, and you can cancel.

## Complaints and law
If you have a complaint, e-mail us at {email}; we reply within 14 days. Dutch law applies to these terms. If you live in another EU country, you keep the protection your country's law gives you.`,
  privacy: `## In short
We collect as little as possible: what is needed for you to learn and, if you pay, to manage your subscription. We sell nothing and use no advertising cookies. Responsible is {name}, {address} ({email}).

## What we keep
- **Without an account:** an anonymous number for this browser, your progress (which stories, words and phrases, your answers and reviews), the level you chose, your device's language, when you visited, and through which link or campaign you first arrived.
- **With an account:** also your e-mail address, and whether you want tips by e-mail (only if you tick it yourself).
- **If you pay:** what you bought, for which period, and that you agreed to Plus starting at once. Your payment details (such as your card number) go straight to Stripe; we never see them.
- **If you join a waitlist:** your e-mail address and for which product.

## What for
To run the app and keep your progress (performing our agreement with you), to handle payments and invoices (agreement and legal duty: invoices are kept for 7 years), to see which campaigns and pages work and to improve the app (legitimate interest; only in groups, not to follow you), and to send you tips if you chose to (consent, which you can withdraw at any time in your account).

## Who helps us
- **Supabase** (database and login, servers in Frankfurt, EU)
- **Vercel** (the website)
- **Stripe** (payments; Stripe is also itself responsible for payment data)
- **Resend** (sending the login codes)

We have agreements with each of them on protecting your data. Where data leaves the EU, this happens with the safeguards the GDPR requires.

## Cookies and storage
We only use what is needed: your login session and a few settings (such as the voice and the direction of the phrases) in your browser. No advertising or tracking cookies.

## How long
We keep your progress and account as long as you use Qissio. An anonymous account unused for 12 months may be deleted. If you delete your account, we erase your data, except what the law requires us to keep (such as invoices).

## Your rights
You may see, correct or delete your data, object, withdraw your consent and get a copy of your data. E-mail {email}; we reply within a month. If you disagree with us, you can complain to the Dutch Data Protection Authority (Autoriteit Persoonsgegevens) or the authority in your own country.

## Children
Qissio is meant for people aged 16 and over. If you are younger, ask your parent or guardian for permission.`,
};

const ar: Texts = {
  titles: { terms: "الشروط والأحكام", privacy: "سياسة الخصوصية" },
  updated: "آخر تحديث: {updated}",
  terms: `## من نحن
Qissio تطبيق لتعلّم اللغات بالقصص القصيرة. تقدّمه {name}، {address}، المسجّلة في الغرفة التجارية الهولندية (KvK) برقم {kvk}، الرقم الضريبي {vat}. يمكنك مراسلتنا على {email}.

## المجاني وPlus
جزء من Qissio مجاني: عدد من القصص والجمل في كل مستوى، مع حدّ يومي. مع Qissio Plus تحصل على كل القصص والجمل والمراجعات للغة واحدة، بلا حدّ يومي. قد نغيّر ما هو مجاني بالضبط؛ أما ما دفعت ثمنه في Plus فيبقى متاحًا لك طوال الفترة المدفوعة.

## الحساب
للدفع تُنشئ حسابًا ببريدك الإلكتروني، وتسجّل الدخول برمز نرسله إليك. احتفظ بالوصول إلى بريدك لنفسك. الحساب الواحد لشخص واحد.

## الأسعار والدفع
الأسعار معروضة في التطبيق وتشمل ضريبة القيمة المضافة. تدفع عبر Stripe بطرق الدفع المعروضة هناك. يُدفع الاشتراك (شهريًا أو سنويًا) تلقائيًا في بداية كل فترة حتى تلغيه. نُبلغك بأي تغيير في السعر قبل 30 يومًا على الأقل، ويمكنك الإلغاء قبل أن يبدأ السعر الجديد.

## الإلغاء
يمكنك إلغاء اشتراكك في أي وقت من حسابك في التطبيق («إدارة الاشتراك والفواتير»). يبقى Plus معك حتى نهاية الفترة التي دفعتها، وبعدها لا يُخصم شيء. لا تُستردّ فترة بدأت، إلا إذا فرض القانون ذلك.

## حق الانسحاب
في المحتوى الرقمي لديك عادةً 14 يومًا للانسحاب. يبدأ Plus فور الدفع. لذلك نسألك صراحةً قبل الدفع إن كنت تريد أن يبدأ Plus فورًا، وإن كنت تعلم أنك بذلك تتنازل عن حق الانسحاب. لا يمكنك الدفع إلا بعد تأكيد ذلك.

## ما نطلبه منك
استخدم Qissio لنفسك وللتعلّم. لا تنسخ القصص والصور والتسجيلات ولا تنشرها خارج التطبيق، ولا تحاول تجاوز التطبيق أو حمايته. إن فعلت، يحقّ لنا حظر حسابك.

## التوفّر والمسؤولية
نبذل جهدنا ليعمل Qissio جيدًا دائمًا، لكن لا يمكننا أن نعد بألّا يتوقف لحظة أو ألّا يحتوي على خطأ. مسؤوليتنا محدودة بما دفعته لنا في الأشهر الاثني عشر السابقة، إلا في حالة العمد أو الإهمال الجسيم.

## التغييرات
عند تغيير هذه الشروط تُنشر النسخة الجديدة هنا بتاريخ جديد. إذا كان التغيير في غير صالحك نُبلغك مسبقًا، ويمكنك الإلغاء.

## الشكاوى والقانون
إن كانت لديك شكوى، راسلنا على {email}، ونردّ خلال 14 يومًا. يسري القانون الهولندي على هذه الشروط. إن كنت تقيم في بلد آخر من الاتحاد الأوروبي، تبقى لك الحماية التي يمنحها قانون بلدك.`,
  privacy: `## باختصار
نجمع أقل ما يمكن: ما يلزم لتتعلّم، وإن دفعت، لإدارة اشتراكك. لا نبيع شيئًا ولا نستخدم ملفات تعريف ارتباط إعلانية. الجهة المسؤولة: {name}، {address} ({email}).

## ما نحتفظ به
- **بدون حساب:** رقم مجهول لهذا المتصفح، وتقدّمك (القصص والكلمات والجمل، وإجاباتك ومراجعاتك)، والمستوى الذي اخترته، ولغة جهازك، ومتى زرتنا، وعبر أي رابط أو حملة وصلت أول مرة.
- **مع حساب:** إضافةً إلى ذلك بريدك الإلكتروني، وهل تريد نصائح بالبريد (فقط إن اخترت ذلك بنفسك).
- **إن دفعت:** ما اشتريته ولأي فترة، وأنك وافقت على بدء Plus فورًا. بيانات الدفع (مثل رقم بطاقتك) تذهب مباشرة إلى Stripe ولا نراها.
- **إن سجّلت في قائمة انتظار:** بريدك الإلكتروني والمنتج.

## لأي غرض
لتشغيل التطبيق وحفظ تقدّمك (تنفيذ اتفاقنا معك)، ولإدارة المدفوعات والفواتير (الاتفاق والالتزام القانوني: نحتفظ بالفواتير 7 سنوات)، ولمعرفة أي الحملات والصفحات تنجح وتحسين التطبيق (مصلحة مشروعة؛ على مستوى المجموعات فقط، لا لتتبّعك)، ولإرسال النصائح إن اخترت ذلك (موافقة يمكنك سحبها في أي وقت من حسابك).

## من يساعدنا
- **Supabase** (قاعدة البيانات وتسجيل الدخول، خوادم في فرانكفورت، الاتحاد الأوروبي)
- **Vercel** (الموقع)
- **Stripe** (المدفوعات؛ وهي مسؤولة أيضًا عن بيانات الدفع)
- **Resend** (إرسال رموز الدخول)

لدينا اتفاقات مع كل منهم لحماية بياناتك. وإن خرجت بيانات من الاتحاد الأوروبي، فبالضمانات التي تطلبها اللائحة العامة لحماية البيانات.

## ملفات تعريف الارتباط والتخزين
نستخدم فقط ما يلزم: جلسة تسجيل الدخول وبعض الإعدادات (مثل الصوت واتجاه الجمل) في متصفحك. لا ملفات إعلانية ولا ملفات تتبّع.

## المدة
نحتفظ بتقدّمك وحسابك ما دمت تستخدم Qissio. يجوز لنا حذف الحساب المجهول الذي لم يُستخدم 12 شهرًا. إن حذفت حسابك نمحو بياناتك، إلا ما يُلزمنا القانون بالاحتفاظ به (مثل الفواتير).

## حقوقك
يحق لك الاطلاع على بياناتك وتصحيحها وحذفها، والاعتراض، وسحب موافقتك، والحصول على نسخة منها. راسلنا على {email}، ونردّ خلال شهر. إن لم توافقنا، يمكنك تقديم شكوى إلى هيئة حماية البيانات الهولندية (Autoriteit Persoonsgegevens) أو الجهة المختصة في بلدك.

## الأطفال
Qissio موجّه لمن هم في السادسة عشرة فما فوق. إن كنت أصغر، فاطلب إذن والدك أو وليّ أمرك.`,
};

export const LEGAL: Record<string, Texts> = { nl, en, ar };
