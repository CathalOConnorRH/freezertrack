import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

export const getItems = (filters = {}) =>
  api.get("/food", { params: filters }).then((r) => r.data);
export const getGroupedItems = (filters = {}) =>
  api.get("/food/grouped", { params: filters }).then((r) => r.data);
export const getHistory = () => api.get("/food/history").then((r) => r.data);
export const getCategories = () => api.get("/food/categories").then((r) => r.data);
export const getStats = () => api.get("/food/stats").then((r) => r.data);
export const createItem = (data) => api.post("/food", data).then((r) => r.data);
export const removeItem = (id) => api.post(`/food/${id}/remove`).then((r) => r.data);
export const decrementItem = (id) =>
  api.post(`/food/${id}/decrement`).then((r) => r.data);
export const readdItem = (id) => api.post(`/food/${id}/readd`).then((r) => r.data);
export const updateItem = (id, data) =>
  api.patch(`/food/${id}`, data).then((r) => r.data);
export const deleteItem = (id) => api.delete(`/food/${id}`);
export const lookupBarcode = (barcode) =>
  api.get(`/food/lookup/${barcode}`).then((r) => r.data);
export const printLabel = (id) =>
  api.post(`/labels/${id}/print`).then((r) => r.data);
export const searchItems = (q) =>
  api.get("/food/search", { params: { q } }).then((r) => r.data);
export const getItemsByBarcode = (barcode) =>
  api.get(`/food/by-barcode/${barcode}`).then((r) => r.data);
export const saveBarcodeMapping = (barcode, name, brand) =>
  api.post("/food/barcode", { barcode, name, brand }).then((r) => r.data);
export const uploadPhoto = (id, file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/food/${id}/photo`, form).then((r) => r.data);
};
export const getHAState = () => api.get("/ha/state").then((r) => r.data);

export const getScannerMode = () => api.get("/scanner/mode").then((r) => r.data);
export const setScannerMode = (mode) =>
  api.put("/scanner/mode", { mode }).then((r) => r.data);

export const getShoppingList = () => api.get("/shopping").then((r) => r.data);
export const addShoppingItem = (data) =>
  api.post("/shopping", data).then((r) => r.data);
export const completeShoppingItem = (id) =>
  api.post(`/shopping/${id}/complete`).then((r) => r.data);
export const deleteShoppingItem = (id) => api.delete(`/shopping/${id}`);
export const suggestShoppingItems = () =>
  api.post("/shopping/suggest").then((r) => r.data);

export const getFreezers = () => api.get("/freezers").then((r) => r.data);
export const createFreezer = (data) =>
  api.post("/freezers", data).then((r) => r.data);
export const updateFreezer = (id, data) =>
  api.patch(`/freezers/${id}`, data).then((r) => r.data);
export const deleteFreezer = (id) => api.delete(`/freezers/${id}`);
export const getPrinterStatus = () =>
  api.get("/labels/printer/status").then((r) => r.data);
export const invalidateLabelCache = () =>
  api.post("/labels/invalidate").then((r) => r.data);

export const getConfig = () => api.get("/admin/config").then((r) => r.data);
export const updateConfig = (settings) =>
  api.patch("/admin/config", { settings }).then((r) => r.data);
export const triggerUpdate = () =>
  api.post("/admin/update").then((r) => r.data);
export const getUpdateStatus = () =>
  api.get("/admin/update/status").then((r) => r.data);
export const restartService = () =>
  api.post("/admin/restart").then((r) => r.data);
export const restoreBackup = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/admin/restore?confirm=true", form).then((r) => r.data);
};

export const purgeHistory = () =>
  api.post("/admin/purge-history").then((r) => r.data);
export const purgeAllItems = () =>
  api.post("/admin/purge-all-items").then((r) => r.data);
export const purgeBarcodeCache = () =>
  api.post("/admin/purge-barcode-cache").then((r) => r.data);
export const purgeShopping = () =>
  api.post("/admin/purge-shopping").then((r) => r.data);
