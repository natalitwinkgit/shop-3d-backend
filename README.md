# shop-3d-backend

## Environment

Set a remote MongoDB connection string in `.env` using `MONGO_URI`.

Example:

```
MONGO_URI=mongodb+srv://<user>:<pass>@cluster0.example.mongodb.net/shop-3d-backend?retryWrites=true&w=majority
```

The app now requires a Mongo URI and will not fall back to a local `127.0.0.1` database.
