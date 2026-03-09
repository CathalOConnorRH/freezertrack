import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

export const getItems = () => api.get("/food").then((r) => r.data);
export const getHistory = () => api.get("/food/history").then((r) => r.data);
export const createItem = (data) => api.post("/food", data).then((r) => r.data);
export const removeItem = (id) => api.post(`/food/${id}/remove`).then((r) => r.data);
export const updateItem = (id, data) =>
  api.patch(`/food/${id}`, data).then((r) => r.data);
export const deleteItem = (id) => api.delete(`/food/${id}`);
export const lookupBarcode = (barcode) =>
  api.get(`/food/lookup/${barcode}`).then((r) => r.data);
export const printLabel = (id) =>
  api.post(`/labels/${id}/print`).then((r) => r.data);
export const searchItems = (q) =>
  api.get("/food/search", { params: { q } }).then((r) => r.data);
export const getHAState = () => api.get("/ha/state").then((r) => r.data);

export const getConfig = () => api.get("/admin/config").then((r) => r.data);
export const updateConfig = (settings) =>
  api.patch("/admin/config", { settings }).then((r) => r.data);
export const triggerUpdate = () =>
  api.post("/admin/update").then((r) => r.data);
export const getUpdateStatus = () =>
  api.get("/admin/update/status").then((r) => r.data);
export const restartService = () =>
  api.post("/admin/restart").then((r) => r.data);
