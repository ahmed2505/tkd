// Single source of truth for the dropdown values: [stored value, Arabic label]
const AGE = require('./public/age-category'); // categories are defined next to the DOB rules that assign them
module.exports = {
  GENDERS: [["Male", "ذكر"], ["Female", "أنثى"]],
  REGIONS: [["Tunis", "تونس"], ["Ariana", "أريانة"], ["Ben Arous", "بن عروس"], ["Manouba", "منوبة"], ["Nabeul", "نابل"], ["Zaghouan", "زغوان"], ["Bizerte", "بنزرت"], ["Béja", "باجة"], ["Jendouba", "جندوبة"], ["Le Kef", "الكاف"], ["Siliana", "سليانة"], ["Sousse", "سوسة"], ["Monastir", "المنستير"], ["Mahdia", "المهدية"], ["Sfax", "صفاقس"], ["Kairouan", "القيروان"], ["Kasserine", "القصرين"], ["Sidi Bouzid", "سيدي بوزيد"], ["Gabès", "قابس"], ["Médenine", "مدنين"], ["Tataouine", "تطاوين"], ["Gafsa", "قفصة"], ["Tozeur", "توزر"], ["Kébili", "قبلي"]],
  BELTS: [["White", "أبيض"], ["Yellow", "أصفر"], ["Orange", "برتقالي"], ["Green", "أخضر"], ["Blue", "أزرق"], ["Red", "أحمر"], ["Black Poom", "أسود بوم"], ["Black 1st Dan", "أسود دان 1"], ["Black 2nd Dan", "أسود دان 2"], ["Black 3rd Dan", "أسود دان 3"], ["Black 4th Dan", "أسود دان 4"], ["Black 5th Dan+", "أسود دان 5+"]],
  SPECIALTIES: [["Kyorugi", "قتال"], ["Poomsae", "فورمات"], ["Freestyle", "فري ستايل"]],
  CATEGORIES: AGE.CATEGORIES.map((c) => [c.id, c.ar]) // Kids / Cadet / Junior / Senior; assigned from the DOB, never typed in
};
