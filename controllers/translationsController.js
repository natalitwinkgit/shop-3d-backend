import Translation from "../models/Translation.js";

const TRANSLATION_DEFAULTS = {
  ua: {
    rooms: {
      living_room: "Вітальня",
      bedroom: "Спальня",
      bathroom: "Ванна кімната",
      kids_room: "Дитяча",
      home_office: "Домашній кабінет",
      dining_room: "Їдальня",
      hallway: "Передпокій",
      kitchen: "Кухня",
    },
    filters: {
      rooms: "Кімната",
    },
  },
  en: {
    rooms: {
      living_room: "Living room",
      bedroom: "Bedroom",
      bathroom: "Bathroom",
      kids_room: "Kids room",
      home_office: "Home office",
      dining_room: "Dining room",
      hallway: "Hallway",
      kitchen: "Kitchen",
    },
    filters: {
      rooms: "Room",
    },
  },
};

export const getTranslationsByLang = async (req, res) => {
  try {
    const { lang } = req.params;

    if (!lang) {
      return res.status(400).json({ message: "Language is required" });
    }

    const translation = await Translation.findOne({ lang }).lean();

    if (!translation) {
      return res.status(404).json({
        message: `Translations for '${lang}' not found`
      });
    }

    // 🔥 ПОВЕРТАЄМО ЧИСТИЙ ОБʼЄКТ ДЛЯ ФРОНТА
    const defaults = TRANSLATION_DEFAULTS[lang] || {};
    return res.json({
      ...defaults,
      ...translation,
      rooms: {
        ...(defaults.rooms || {}),
        ...((translation && translation.rooms) || {}),
      },
      filters: {
        ...(defaults.filters || {}),
        ...((translation && translation.filters) || {}),
      },
    });

  } catch (error) {
    console.error("Translation controller error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
