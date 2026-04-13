# Шпаргалка для фронту: фото товару

## Правило

- Максимум 10 фото на один товар.
- Перше фото завжди є preview.
- Якщо користувач додає ще фото, на фронті додавай нове поле вводу для наступного URL: `Фото 2`, `Фото 3`, ... до `Фото 10`.
- На редагуванні товару краще відправляти весь актуальний список фото, а не тільки нове поле.

## Рекомендований JSON payload

Найпростіший варіант: фронт тримає масив `imageUrls`, а при submit відправляє `previewImage` і `images`.

```js
const cleanImageUrls = imageUrls
  .map((url) => String(url || "").trim())
  .filter(Boolean)
  .slice(0, 10);

const payload = {
  name,
  category,
  price,
  previewImage: cleanImageUrls[0] || "",
  images: cleanImageUrls,
};
```

Приклад body:

```json
{
  "name": { "ua": "Диван Luna", "en": "Luna sofa" },
  "category": "sofas",
  "price": 35879,
  "previewImage": "https://cdn.example.com/luna-1.jpg",
  "images": [
    "https://cdn.example.com/luna-1.jpg",
    "https://cdn.example.com/luna-2.jpg",
    "https://cdn.example.com/luna-3.jpg"
  ]
}
```

## Варіант з окремими полями

Якщо форма простіша і кожен input має окреме ім'я, backend також приймає:

```json
{
  "imageUrl": "https://cdn.example.com/luna-1.jpg",
  "imageUrl2": "https://cdn.example.com/luna-2.jpg",
  "imageUrl3": "https://cdn.example.com/luna-3.jpg"
}
```

Тут `imageUrl` буде preview, а `imageUrl2` і далі стануть додатковими фото.

Також можна використовувати `imageUrl1` замість `imageUrl`:

```json
{
  "imageUrl1": "https://cdn.example.com/luna-1.jpg",
  "imageUrl2": "https://cdn.example.com/luna-2.jpg"
}
```

## UI логіка

1. Початковий state:

```js
const [imageUrls, setImageUrls] = useState([""]);
```

2. Кнопка “Додати фото”:

```js
const addImageInput = () => {
  setImageUrls((items) => (items.length >= 10 ? items : [...items, ""]));
};
```

3. Плейсхолдери:

```js
imageUrls.map((value, index) => (
  <input
    key={index}
    value={value}
    placeholder={index === 0 ? "Фото 1 - preview" : `Фото ${index + 1}`}
    onChange={(event) => updateImageUrl(index, event.target.value)}
  />
));
```

4. Перед submit:

```js
if (cleanImageUrls.length > 10) {
  throw new Error("Можна додати максимум 10 фото");
}
```

## Multipart файли

Якщо відправляєте файли через `multipart/form-data`:

- `imageFiles` - до 10 файлів, перший стане preview, якщо `previewImageFile` не передали.
- `previewImageFile` - окремий файл preview.
- Якщо є `previewImageFile`, тоді в `imageFiles` відправляйте максимум 9 файлів, щоб разом було не більше 10 фото.
