import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use((req,res,next)=>{ console.log(req.method, req.url); next(); });

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/mydb";
let useMemory = false;
let memory = [];
let products; // mongo collection when available

const ensureStore = () => { if (!products && !useMemory) useMemory = true; };
const errJson = (res, status, msg) => res.status(status).json({ error: msg });

// memory helpers
const memAll = () => [...memory].reverse();
const memGet = (id) => memory.find(x => String(x._id) === String(id));
const memIns = (doc) => { const _id = Date.now().toString(36)+Math.random().toString(36).slice(2,8); const d = { _id, ...doc }; memory.push(d); return d; };
const memUpd = (id,u)=>{ const i=memory.findIndex(x=>String(x._id)===String(id)); if(i===-1)return null; memory[i]={...memory[i],...u}; return memory[i]; };
const memDel = (id)=>{ const i=memory.findIndex(x=>String(x._id)===String(id)); if(i===-1)return false; memory.splice(i,1); return true; };

app.get("/api/health", (_req, res) => res.json({ ok: true, storage: useMemory ? "memory" : (products ? "mongo" : "unknown") }));

app.get("/api/products", async (_req, res) => {
  try {
    ensureStore();
    if (useMemory) return res.json(memAll());
    const list = await products.find({}).sort({ _id: -1 }).toArray();
    return res.json(list);
  } catch (e) {
    console.error("GET /api/products failed:", e);
    return errJson(res, 500, "list_failed");
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    ensureStore();
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

app.post("/api/products", async (req, res) => {
  const { name, price } = req.body ?? {};
  if (typeof name !== "string" || typeof price !== "number" || Number.isNaN(price)) {
    return errJson(res, 400, "name string and price number required");
  }
  const doc = { name: name.trim(), price: Number(price) };

  ensureStore();

  // Always try memory first (never fails)
  if (useMemory) {
    const d = memIns(doc);
    return res.status(201).json(d);
  }

  // Try Mongo, and if it throws, fall back to memory immediately.
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

app.put("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const update = {};
    if (typeof req.body?.name === "string") update.name = req.body.name.trim();
    if (typeof req.body?.price === "number" && !Number.isNaN(req.body.price)) update.price = Number(req.body.price);

    ensureStore();
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
    return r ? res.json(r) : errJson(res, 404, "not_found");
  } catch (e) {
    console.error("PUT /api/products/:id failed:", e);
    return errJson(res, 500, "update_failed");
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    ensureStore();
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

// global error guard
app.use((err, _req, res, _next) => {
  console.error("global error:", err);
  res.status(500).json({ error: "server_error" });
});

const PORT = Number(process.env.PORT || 3000);
(async () => {
  try {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db("mydb");
    products = db.collection("products");
    await products.createIndex({ name: 1 }, { unique: false });
    app.listen(PORT, () => console.log(`[server] http://localhost:${PORT} · storage=mongo`));
  } catch (e) {
    console.warn("[mongo] unavailable, using memory:", e?.message || e);
    useMemory = true;
    app.listen(PORT, () => console.log(`[server] http://localhost:${PORT} · storage=memory`));
  }
})();
