const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "sos-forest-algeria.firebaseapp.com",
  projectId: "sos-forest-algeria",
  storageBucket: "sos-forest-algeria.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

const FIREBASE_COLLECTIONS = {
  REPORTS: "reports",
  USERS: "users",
  ALERTS: "alerts",
  ZONES: "zones",
  ACTIVITIES: "activities"
};

let firebaseApp = null;
let db = null;
let storage = null;
let firebaseAvailable = false;

function initFirebase() {
  try {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length === 0) {
      firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      storage = firebase.storage();
      firebaseAvailable = true;
      console.log("Firebase initialized successfully");
    } else if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      firebaseApp = firebase.apps[0];
      db = firebase.firestore();
      storage = firebase.storage();
      firebaseAvailable = true;
    }
  } catch (error) {
    console.warn("Firebase initialization failed, using localStorage fallback:", error);
    firebaseAvailable = false;
  }
  return firebaseAvailable;
}

function getFirestore() {
  if (firebaseAvailable && db) return db;
  return null;
}

function getStorage() {
  if (firebaseAvailable && storage) return storage;
  return null;
}

async function saveToFirestore(collection, docId, data) {
  if (firebaseAvailable && db) {
    try {
      const docRef = db.collection(collection).doc(docId);
      await docRef.set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      return { success: true, id: docId };
    } catch (error) {
      console.error("Firestore save error:", error);
    }
  }

  try {
    const key = `forest_${collection}_${docId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "{}");
    const record = { ...existing, ...data, updatedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(record));
    return { success: true, id: docId, fallback: true };
  } catch (error) {
    console.error("localStorage save error:", error);
    return { success: false, error: error.message };
  }
}

async function getFromFirestore(collection, docId) {
  if (firebaseAvailable && db) {
    try {
      const doc = await db.collection(collection).doc(docId).get();
      if (doc.exists) {
        return { success: true, data: { id: doc.id, ...doc.data() } };
      }
      return { success: true, data: null };
    } catch (error) {
      console.error("Firestore read error:", error);
    }
  }

  try {
    const key = `forest_${collection}_${docId}`;
    const data = localStorage.getItem(key);
    if (data) {
      return { success: true, data: JSON.parse(key), fallback: true };
    }
    return { success: true, data: null, fallback: true };
  } catch (error) {
    console.error("localStorage read error:", error);
    return { success: false, error: error.message };
  }
}

async function getAllFromFirestore(collection) {
  if (firebaseAvailable && db) {
    try {
      const snapshot = await db.collection(collection).get();
      const items = [];
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      return { success: true, data: items };
    } catch (error) {
      console.error("Firestore list error:", error);
    }
  }

  try {
    const items = [];
    const prefix = `forest_${collection}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const docId = key.slice(prefix.length);
        items.push({ id: docId, ...JSON.parse(localStorage.getItem(key)) });
      }
    }
    return { success: true, data: items, fallback: true };
  } catch (error) {
    console.error("localStorage list error:", error);
    return { success: false, error: error.message };
  }
}

async function deleteFromFirestore(collection, docId) {
  if (firebaseAvailable && db) {
    try {
      await db.collection(collection).doc(docId).delete();
      return { success: true };
    } catch (error) {
      console.error("Firestore delete error:", error);
    }
  }

  try {
    const key = `forest_${collection}_${docId}`;
    localStorage.removeItem(key);
    return { success: true, fallback: true };
  } catch (error) {
    console.error("localStorage delete error:", error);
    return { success: false, error: error.message };
  }
}

async function uploadImage(path, file) {
  if (firebaseAvailable && storage) {
    try {
      const storageRef = storage.ref();
      const fileRef = storageRef.child(path);
      const snapshot = await fileRef.put(file);
      const downloadURL = await snapshot.ref.getDownloadURL();
      return { success: true, url: downloadURL, path: path };
    } catch (error) {
      console.error("Firebase upload error:", error);
    }
  }

  try {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const dataUrl = e.target.result;
        const key = `forest_img_${path.replace(/\//g, "_")}`;
        localStorage.setItem(key, dataUrl);
        resolve({ success: true, url: dataUrl, path: path, fallback: true });
      };
      reader.onerror = function () {
        resolve({ success: false, error: "Failed to read file" });
      };
      reader.readAsDataURL(file);
    });
  } catch (error) {
    console.error("localStorage upload error:", error);
    return { success: false, error: error.message };
  }
}

async function getImage(path) {
  if (firebaseAvailable && storage) {
    try {
      const url = await storage.ref(path).getDownloadURL();
      return { success: true, url: url };
    } catch (error) {
      console.error("Firebase image fetch error:", error);
    }
  }

  try {
    const key = `forest_img_${path.replace(/\//g, "_")}`;
    const dataUrl = localStorage.getItem(key);
    if (dataUrl) {
      return { success: true, url: dataUrl, fallback: true };
    }
    return { success: false, error: "Image not found" };
  } catch (error) {
    console.error("localStorage image fetch error:", error);
    return { success: false, error: error.message };
  }
}

function isFirebaseAvailable() {
  return firebaseAvailable;
}

export {
  FIREBASE_CONFIG,
  FIREBASE_COLLECTIONS,
  initFirebase,
  getFirestore,
  getStorage,
  saveToFirestore,
  getFromFirestore,
  getAllFromFirestore,
  deleteFromFirestore,
  uploadImage,
  getImage,
  isFirebaseAvailable
};
