// server/index.js (ESM)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

/* --------------------------- App & Middleware --------------------------- */
const app = express();
app.use(cors());
app.use(express.json());
app.use((req, _res, next) => { console.log(req.method, req.url); next(); });

/* ------------------------------ Config --------------------------------- */
const PORT = Number(process.env.PORT || 3000);
const uri  = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/mydb";

/* ------------------------- Storage Abstraction -------------------------- */
let useMemory = false;          // toggled automatically if Mongo fails
let memory = [];                // in-memory store when Mongo is down
let products = null;            // MongoDB collection when available

const setFallbackIfNoMongo = () => {
  if (!products && !useMemory) useMemory = true;
};

const errJson = (res, status, msg) => res.status(status).json({ error: msg });

/* ----------------------- In-memory CRUD helpers ------------------------- */
const memAll = () => {
  return [...memory].reverse();
};

const memGet = (id) => {
  return memory.find(x => String(x._id) === String(id));
};

const memIns = (doc) => {
  const _id =
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);
  const d = { _id, ...doc };
  memory.push(d);
  return d;
};

const memUpd = (id, update) => {
  const i = memory.findIndex(x => String(x._id) === String(id));
  if (i === -1) return null;
  memory[i] = { ...memory[i], ...update };
  return memory[i];
};

const memDel = (id) => {
  const i = memory.findIndex(x => String(x._id) === String(id));
  if (i === -1) return false;
  memory.splice(i, 1);
  return true;
};

/* ------------------------------ Health ---------------------------------- */
app.get("/api/health", (_req, res) => {
  const storage = useMemory ? "memory" : (products ? "mongo" : "unknown");
  res.json({ ok: true, storage });
});

/* ------------------------------ Products -------------------------------- */
// GET /api/products
app.get("/api/products", async (_req, res) => {
  try {
    setFallbackIfNoMongo();
    if (useMemory) return res.json(memAll());

    const list = await products.find({}).sort({ _id: -1 }).toArray();
    return res.json(list);
  } catch (e) {
    console.error("GET /api/products failed:", e);
    return errJson(res, 500, "list_failed");
  }
});

// GET /api/products/:id
app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    setFallbackIfNoMongo();

    if (useMemory) {
      const doc = memGet(id);
      return doc ? res.json(doc) : errJson(res, 404, "not_found");
    }

    if (!ObjectId.isValid(id)) return errJson(res, 400, "invalid_id");
    const doc = await products.findOne({ _id: new ObjectId(id) });
    return doc ? res.json(doc) : errJson(res, 404, "not_found");
  } catch (e) {
    console.error("GET /api/products/:id failed:", e);
    return errJson(res, 500, "get_failed");
  }
});

// POST /api/products
app.post("/api/products", async (req, res) => {
  const { name, price } = req.body ?? {};

  // Basic validation
  if (typeof name !== "string" || !name.trim().length) {
    return errJson(res, 400, "name_required");
  }
  if (typeof price !== "number" || Number.isNaN(price)) {
    return errJson(res, 400, "price_number_required");
  }

  const doc = { name: name.trim(), price: Number(price) };
  setFallbackIfNoMongo();

  // Memory mode
  if (useMemory) {
    const d = memIns(doc);
    return res.status(201).json(d);
  }

  // Mongo mode; fallback to memory on error
  try {
    const { insertedId } = await products.insertOne(doc);
    return res.status(201).json({ _id: String(insertedId), ...doc });
  } catch (e) {
    console.warn("POST /api/products mongo failed, falling back to memory:", e?.message || e);
    useMemory = true;
    const d = memIns(doc);
    return res.status(201).json(d);
  }
});

// PUT /api/products/:id
app.put("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Build safe update object
    const update = {};
    if (typeof req.body?.name === "string" && req.body.name.trim().length) {
      update.name = req.body.name.trim();
    }
    if (typeof req.body?.price === "number" && !Number.isNaN(req.body.price)) {
      update.price = Number(req.body.price);
    }
    if (!Object.keys(update).length) return errJson(res, 400, "no_valid_fields");
    

    setFallbackIfNoMongo();

    if (useMemory) {
      const r = memUpd(id, update);
      return r ? res.json(r) : errJson(res, 404, "not_found");
    }

    if (!ObjectId.isValid(id)) return errJson(res, 400, "invalid_id");
    const r = await products.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: "after" }
    );


    return r?.value ? res.json(r.value) : errJson(res, 404, "not_found");
  } catch (e) {
    console.error("PUT /api/products/:id failed:", e);
    return errJson(res, 500, "update_failed");
  }
});

// DELETE /api/products/:id
app.delete("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    setFallbackIfNoMongo();

    if (useMemory) {
      const ok = memDel(id);
      return ok ? res.json({ ok: true }) : errJson(res, 404, "not_found");
    }

    if (!ObjectId.isValid(id)) return errJson(res, 400, "invalid_id");
    const r = await products.deleteOne({ _id: new ObjectId(id) });
    return r.deletedCount ? res.json({ ok: true }) : errJson(res, 404, "not_found");
  } catch (e) {
    console.error("DELETE /api/products/:id failed:", e);
    return errJson(res, 500, "delete_failed");
  }
});

/* ---------------------------- Global Guard ------------------------------ */
app.use((err, _req, res, _next) => {
  console.error("global error:", err);
  res.status(500).json({ error: "server_error" });
});

/* ------------------------------- Boot ----------------------------------- */
(async () => {
  try {
    const client = new MongoClient(uri);
    await client.connect();

    const db = client.db("mydb");
    products = db.collection("products");


    await products.createIndex({ name: 1 }, { unique: false });

    app.listen(PORT, () =>
      console.log(`[server] http://localhost:${PORT} · storage=mongo`)
    );
  } catch (e) {
    console.warn("[mongo] unavailable, using memory:", e?.message || e);
    useMemory = true;
    app.listen(PORT, () =>
      console.log(`[server] http://localhost:${PORT} · storage=memory`)
    );
  }
})();
