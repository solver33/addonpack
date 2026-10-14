// Перевод данных Raider.IO на русский + цвета классов.
(function (root) {
  'use strict';
  const WNL = (root.WNL = root.WNL || {});

  WNL.i18n = {
    CLASS: {
      'Warrior': 'Воин', 'Paladin': 'Паладин', 'Hunter': 'Охотник', 'Rogue': 'Разбойник', 'Priest': 'Жрец',
      'Death Knight': 'Рыцарь смерти', 'Shaman': 'Шаман', 'Mage': 'Маг', 'Warlock': 'Чернокнижник',
      'Monk': 'Монах', 'Druid': 'Друид', 'Demon Hunter': 'Охотник на демонов', 'Evoker': 'Пробудитель',
    },
    CLASS_COLOR: {
      'Warrior': '#C69B6D', 'Paladin': '#F48CBA', 'Hunter': '#AAD372', 'Rogue': '#FFF468', 'Priest': '#FFFFFF',
      'Death Knight': '#C41E3A', 'Shaman': '#0070DD', 'Mage': '#3FC7EB', 'Warlock': '#8788EE',
      'Monk': '#00FF98', 'Druid': '#FF7C0A', 'Demon Hunter': '#A330C9', 'Evoker': '#33937F',
    },
    FACTION: { alliance: 'Альянс', horde: 'Орда', neutral: 'Нейтрал' },
    FACTION_COLOR: { alliance: '#4a8cff', horde: '#ff4a4a', neutral: '#c8c8c8' },
    ROLE: { TANK: 'танк', HEALING: 'хил', DPS: 'дд' },
    SPEC: {
      'Arms': 'Оружие', 'Fury': 'Неистовство', 'Protection': 'Защита', 'Holy': 'Свет', 'Retribution': 'Воздаяние',
      'Beast Mastery': 'Повелитель зверей', 'Marksmanship': 'Стрельба', 'Survival': 'Выживание',
      'Assassination': 'Ликвидация', 'Outlaw': 'Головорез', 'Subtlety': 'Скрытность', 'Discipline': 'Послушание',
      'Shadow': 'Тьма', 'Blood': 'Кровь', 'Frost': 'Лёд', 'Unholy': 'Нечестивость', 'Elemental': 'Стихии',
      'Enhancement': 'Совершенствование', 'Restoration': 'Исцеление', 'Arcane': 'Тайная магия', 'Fire': 'Огонь',
      'Affliction': 'Колдовство', 'Demonology': 'Демонология', 'Destruction': 'Разрушение',
      'Brewmaster': 'Хмелевар', 'Mistweaver': 'Ткач туманов', 'Windwalker': 'Танцующий с ветром',
      'Balance': 'Баланс', 'Feral': 'Сила зверя', 'Guardian': 'Страж', 'Havoc': 'Истребление',
      'Vengeance': 'Месть', 'Devastation': 'Опустошение', 'Preservation': 'Сохранение', 'Augmentation': 'Насыщение',
    },
    RACE: {
      'Human': 'Человек', 'Dwarf': 'Дворф', 'Night Elf': 'Ночной эльф', 'Gnome': 'Гном', 'Draenei': 'Дреней',
      'Worgen': 'Ворген', 'Pandaren': 'Пандарен', 'Void Elf': 'Эльф Бездны', 'Lightforged Draenei': 'Озарённый дреней',
      'Dark Iron Dwarf': 'Дворф Чёрного Железа', 'Kul Tiran': 'Култирасец', 'Mechagnome': 'Механогном',
      'Orc': 'Орк', 'Undead': 'Нежить', 'Tauren': 'Таурен', 'Troll': 'Тролль', 'Blood Elf': 'Эльф крови',
      'Goblin': 'Гоблин', 'Nightborne': 'Ночнорождённый', 'Highmountain Tauren': 'Таурен Крутогорья',
      "Mag'har Orc": "Маг'хар", 'Zandalari Troll': 'Зандалар', 'Vulpera': 'Вульпера', 'Dracthyr': 'Драктир',
      'Earthen': 'Земельник',
    },
    t(dict, key) { return (key && this[dict][key]) || key || ''; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
