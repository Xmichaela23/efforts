/**
 * Execution Storage Service - IndexedDB for Workout Data
 * 
 * Stores workout samples locally during execution for crash safety.
 * Syncs to Supabase on workout completion.
 */

import type { ExecutionSample, ExecutionContext, GPSSample } from '@/types/workoutExecution';

// ============================================================================
// Types
// ============================================================================

export interface StoredWorkoutSession {
  id: string;                          // UUID
  planned_workout_id: string | null;
  workout_type: 'run' | 'ride';
  started_at: number;                  // Unix ms
  environment: 'indoor' | 'outdoor';
  samples: ExecutionSample[];
  gps_track: GPSSample[];
  execution_context: ExecutionContext;
  status: 'in_progress' | 'completed' | 'synced';
  completed_at?: number;
  synced_at?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'efforts-workout-execution';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const SAMPLES_STORE_NAME = 'samples';

// ============================================================================
// IndexedDB Helpers
// ============================================================================

let dbPromise: Promise<IDBDatabase> | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Sessions store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const sessionStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        sessionStore.createIndex('status', 'status', { unique: false });
        sessionStore.createIndex('started_at', 'started_at', { unique: false });
      }
      
      // Samples store (for incremental saving during workout)
      if (!db.objectStoreNames.contains(SAMPLES_STORE_NAME)) {
        const samplesStore = db.createObjectStore(SAMPLES_STORE_NAME, { 
          keyPath: ['session_id', 'timestamp'] 
        });
        samplesStore.createIndex('session_id', 'session_id', { unique: false });
      }
    };
  });
  
  return dbPromise;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a new workout session
 */
export async function createSession(
  session: Omit<StoredWorkoutSession, 'samples' | 'gps_track' | 'status'>
): Promise<string> {
  const db = await getDB();
  
  const fullSession: StoredWorkoutSession = {
    ...session,
    samples: [],
    gps_track: [],
    status: 'in_progress',
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(fullSession);
    
    request.onsuccess = () => resolve(session.id);
    request.onerror = () => reject(new Error('Failed to create session'));
  });
}

/**
 * Get a session by ID
 */
export async function getSession(id: string): Promise<StoredWorkoutSession | null> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('Failed to get session'));
  });
}

/**
 * Get all in-progress sessions (for recovery after crash)
 */
export async function getInProgressSessions(): Promise<StoredWorkoutSession[]> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.getAll('in_progress');
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error('Failed to get in-progress sessions'));
  });
}

/**
 * Get sessions pending sync
 */
export async function getPendingSyncSessions(): Promise<StoredWorkoutSession[]> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.getAll('completed');
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error('Failed to get pending sync sessions'));
  });
}

// ============================================================================
// Sample Management
// ============================================================================

/**
 * Add samples to a session (incremental during workout)
 */
export async function addSamples(
  sessionId: string,
  samples: ExecutionSample[]
): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SAMPLES_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(SAMPLES_STORE_NAME);
    
    for (const sample of samples) {
      store.add({
        session_id: sessionId,
        timestamp: sample.timestamp,
        data: sample,
      });
    }
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to add samples'));
  });
}

/**
 * Get all samples for a session
 */
export async function getSamples(sessionId: string): Promise<ExecutionSample[]> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SAMPLES_STORE_NAME], 'readonly');
    const store = transaction.objectStore(SAMPLES_STORE_NAME);
    const index = store.index('session_id');
    const request = index.getAll(sessionId);
    
    request.onsuccess = () => {
      const results = request.result || [];
      resolve(results.map((r: { data: ExecutionSample }) => r.data));
    };
    request.onerror = () => reject(new Error('Failed to get samples'));
  });
}

/**
 * Add GPS points to a session
 */
export async function addGPSTrack(
  sessionId: string,
  points: GPSSample[]
): Promise<void> {
  const db = await getDB();
  const session = await getSession(sessionId);
  
  if (!session) {
    throw new Error('Session not found');
  }
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    session.gps_track = [...session.gps_track, ...points];
    
    const request = store.put(session);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to add GPS track'));
  });
}

// ============================================================================
// Session Completion
// ============================================================================

/**
 * Mark session as completed (ready for sync)
 */
export async function completeSession(
  sessionId: string,
  finalSamples?: ExecutionSample[]
): Promise<StoredWorkoutSession> {
  const db = await getDB();
  
  // Get all samples from samples store
  const storedSamples = await getSamples(sessionId);
  const allSamples = [...storedSamples, ...(finalSamples || [])];
  
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    session.samples = allSamples;
    session.status = 'completed';
    session.completed_at = Date.now();
    
    const request = store.put(session);
    
    request.onsuccess = () => resolve(session);
    request.onerror = () => reject(new Error('Failed to complete session'));
  });
}

/**
 * Mark session as synced
 */
export async function markSessionSynced(sessionId: string): Promise<void> {
  const db = await getDB();
  const session = await getSession(sessionId);
  
  if (!session) {
    throw new Error('Session not found');
  }
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    session.status = 'synced';
    session.synced_at = Date.now();
    
    const request = store.put(session);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to mark session synced'));
  });
}

/**
 * Delete a session (after successful sync or user discard)
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, SAMPLES_STORE_NAME], 'readwrite');
    
    // Delete session
    const sessionStore = transaction.objectStore(STORE_NAME);
    sessionStore.delete(sessionId);
    
    // Delete samples
    const samplesStore = transaction.objectStore(SAMPLES_STORE_NAME);
    const samplesIndex = samplesStore.index('session_id');
    const samplesRequest = samplesIndex.openCursor(IDBKeyRange.only(sessionId));
    
    samplesRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to delete session'));
  });
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Delete old synced sessions (cleanup)
 */
export async function cleanupOldSessions(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const db = await getDB();
  const cutoff = Date.now() - olderThanMs;
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.openCursor(IDBKeyRange.only('synced'));
    
    request.onsuccess = async (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const session = cursor.value as StoredWorkoutSession;
        if (session.synced_at && session.synced_at < cutoff) {
          await deleteSession(session.id);
        }
        cursor.continue();
      }
    };
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to cleanup sessions'));
  });
}

// ============================================================================
// Export for use
// ============================================================================

export const executionStorage = {
  createSession,
  getSession,
  getInProgressSessions,
  getPendingSyncSessions,
  addSamples,
  getSamples,
  addGPSTrack,
  completeSession,
  markSessionSynced,
  deleteSession,
  cleanupOldSessions,
};

