# Шпаргалка для фронту: кімнати, стилі, колекції товару

## Що змінилось

- `Room Keys`, `Style Keys`, `Collection Keys` тепер мають словник у MongoDB.
- Колекції в Mongo: `productrooms`, `productstyles`, `productcollections`.
- Поле `kind` у відповіді API лишається тільки як підказка для фронта; у Mongo воно більше не використовується для розділення списків.
- При створенні/редагуванні товару адмін має вибирати значення зі списку, а не вводити ключ вручну.
- У товар відправляємо тільки ключі: `roomKeys`, `styleKeys`, `collectionKeys`.
- Якщо для типу словника є активні значення, backend відхилить невідомий ключ з `400`.

## Завантажити списки для форми

Найпростіше одним запитом:

```js
const productAttributes = await apiClient("/api/product-attributes");

const rooms = productAttributes.rooms;
const styles = productAttributes.styles;
const collections = productAttributes.collections;
```

Відповідь:

```json
{
  "rooms": [
    {
      "_id": "room_attribute_id",
      "kind": "room",
      "key": "living_room",
      "name": { "ua": "Вітальня", "en": "Living room" },
      "description": { "ua": "", "en": "" },
      "aliases": ["living_room", "living-room", "livingroom"],
      "sortOrder": 0,
      "isActive": true
    }
  ],
  "styles": [],
  "collections": []
}
```

Можна вантажити окремо:

```text
GET /api/product-attributes/rooms
GET /api/product-attributes/styles
GET /api/product-attributes/collections
```

## State форми

```js
const [roomKeys, setRoomKeys] = useState([]);
const [styleKeys, setStyleKeys] = useState([]);
const [collectionKeys, setCollectionKeys] = useState([]);
```

Для `<select multiple>` value має бути саме `item.key`:

```jsx
<select
  multiple
  value={roomKeys}
  onChange={(event) =>
    setRoomKeys(Array.from(event.target.selectedOptions, (option) => option.value))
  }
>
  {rooms.map((item) => (
    <option key={item.key} value={item.key}>
      {item.name.ua || item.name.en || item.key}
    </option>
  ))}
</select>
```

Те саме для `styles` -> `styleKeys` і `collections` -> `collectionKeys`.

## Submit товару

```js
const payload = {
  name,
  category,
  subCategory,
  price,
  roomKeys,
  styleKeys,
  collectionKeys,
  specifications: {
    material: materialId,
    manufacturer: manufacturerId,
  },
};

await apiClient("/api/admin/products", {
  method: "POST",
  body: payload,
});
```

Приклад JSON:

```json
{
  "name": { "ua": "Диван Arco", "en": "Arco sofa" },
  "category": "sofas",
  "subCategory": "corner",
  "price": 35900,
  "roomKeys": ["living_room"],
  "styleKeys": ["modern"],
  "collectionKeys": ["arco_living"]
}
```

Backend нормалізує `living-room` у `living_room`, але краще на фронті відправляти `key` рівно з довідника.

## Redux helper у цьому репозиторії

У `frontend-state/slices/catalogSlice.js` доданий thunk:

```js
dispatch(loadProductAttributesThunk());
```

Після fulfilled списки будуть тут:

```js
const { productAttributes } = useSelector((state) => state.catalog);

const rooms = productAttributes?.rooms || [];
const styles = productAttributes?.styles || [];
const collections = productAttributes?.collections || [];
```

## Admin CRUD для довідника

Створити нову кімнату:

```text
POST /api/admin/product-attributes/rooms
```

```json
{
  "key": "living_room",
  "name": { "ua": "Вітальня", "en": "Living room" },
  "description": { "ua": "", "en": "" },
  "aliases": ["living-room"],
  "sortOrder": 10,
  "isActive": true
}
```

Для стилів і колекцій:

```text
POST /api/admin/product-attributes/styles
POST /api/admin/product-attributes/collections
PATCH /api/admin/product-attributes/:id
DELETE /api/admin/product-attributes/:id
```

## Для деплою або нової Mongo

Щоб засіяти дефолтні значення і нормалізувати старі товари:

```bash
npm run products:attributes:backfill
```
