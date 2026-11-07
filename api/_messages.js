// Pre-filled WhatsApp message, written in the DONOR's chosen language.
const T = {
  en: (v) => [
    `Hello ${v.name}, I found your number on ${v.site} (blood donor registry).`,
    `A patient at ${v.hospital} urgently needs ${v.group} blood${v.units ? ` (${v.units} unit${v.units === '1' ? '' : 's'})` : ''}. Can you help?`,
    `If you can't donate now, please reply "No" so we can ask someone else.`,
    v.from ? `- ${v.from}` : '',
  ],
  hi: (v) => [
    `नमस्ते ${v.name} जी, मुझे आपका नंबर ${v.site} (रक्तदाता रजिस्ट्री) से मिला।`,
    `${v.hospital} में एक मरीज़ को तुरंत ${v.group} खून की ज़रूरत है${v.units ? ` (${v.units} यूनिट)` : ''}। क्या आप मदद कर सकते हैं?`,
    `अगर आप अभी नहीं दे सकते, तो कृपया "नहीं" लिख दें ताकि हम किसी और से पूछ सकें।`,
    v.from ? `- ${v.from}` : '',
  ],
  bn: (v) => [
    `নমস্কার ${v.name}, আমি ${v.site} (রক্তদাতা রেজিস্ট্রি) থেকে আপনার নম্বর পেয়েছি।`,
    `${v.hospital}-এ একজন রোগীর জরুরি ভিত্তিতে ${v.group} রক্ত প্রয়োজন${v.units ? ` (${v.units} ইউনিট)` : ''}। আপনি কি সাহায্য করতে পারবেন?`,
    `এখন দিতে না পারলে দয়া করে "না" লিখে দিন, যাতে আমরা অন্য কাউকে জিজ্ঞাসা করতে পারি।`,
    v.from ? `- ${v.from}` : '',
  ],
};

export function waMessage(lang, v) {
  return (T[lang] || T.en)(v).filter(Boolean).join('\n');
}
