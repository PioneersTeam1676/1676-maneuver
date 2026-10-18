import Dexie, { type Table } from 'dexie';
import { toast } from 'sonner';
import type { ScoutingDataWithId } from './scoutingDataUtils';
import type { PitScoutingEntry } from './pitScoutingTypes';
import { apiDelete, apiGet, apiPatch, apiPost } from './apiClient';
import { withScoutingSeasonBody, withScoutingSeasonParams } from '@/lib/scoutingSeason';
import { recordLocalBackup } from '@/lib/localBackup';

const SLOW_SYNC_WARN_MS = 6_000;
const SLOW_SYNC_TOAST_ID = 'slow-sync-warning';

const startSlowSyncWarning = (label: string): (() => void) => {
	const timer = setTimeout(() => {
		toast.message(`${label} sync slow — staying queued offline-safe`, {
			id: SLOW_SYNC_TOAST_ID,
			duration: Infinity,
		});
	}, SLOW_SYNC_WARN_MS);
	return () => {
		clearTimeout(timer);
		toast.dismiss(SLOW_SYNC_TOAST_ID);
	};
};

export interface Scout {
	name: string;
	pis: number;
	pisFromPredictions: number;
	totalPredictions: number;
	correctPredictions: number;
	currentStreak: number;
	longestStreak: number;
	createdAt: number;
	lastUpdated: number;
}

export interface MatchPrediction {
	id: string;
	scoutName: string;
	eventName: string;
	matchNumber: string;
	predictedWinner: 'red' | 'blue';
	wager?: number;
	actualWinner?: 'red' | 'blue' | 'tie';
	isCorrect?: boolean;
	pointsAwarded?: number;
	timestamp: number;
	verified: boolean;
}

export interface ScoutAchievement {
	scoutName: string;
	achievementId: string;
	unlockedAt: number;
	progress?: number;
}

export interface ScoutingEntryDB {
	id: string;
	clientId?: string;
	serverId?: number;
	teamNumber?: string;
	matchNumber?: string;
	alliance?: string;
	scoutName?: string;
	eventName?: string;
	data: Record<string, unknown>;
	timestamp: number;
	synced?: boolean;
}

export class SimpleScoutingAppDB extends Dexie {
	scoutingData!: Table<ScoutingEntryDB>;

	constructor() {
		super('SimpleScoutingDB');

		this.version(1).stores({
			scoutingData: 'id, teamNumber, matchNumber, alliance, scoutName, eventName, timestamp',
		});
	}
}

export class PitScoutingDB extends Dexie {
	pitScoutingData!: Table<PitScoutingEntry>;

	constructor() {
		super('PitScoutingDB');

		this.version(1).stores({
			pitScoutingData: 'id, teamNumber, eventName, scoutName, timestamp, [teamNumber+eventName]',
		});
		this.version(2).stores({
			pitScoutingData: 'id, teamNumber, eventName, scoutName, timestamp, synced, [teamNumber+eventName]',
		});
	}
}

export class ScoutProfileDB extends Dexie {
	scouts!: Table<Scout>;
	predictions!: Table<MatchPrediction>;
	scoutAchievements!: Table<ScoutAchievement>;

	constructor() {
		super('ScoutProfileDB');

		this.version(1).stores({
			scouts: 'name, Pis, totalPredictions, correctPredictions, currentStreak, longestStreak, lastUpdated',
			predictions: 'id, scoutName, eventName, matchNumber, predictedWinner, timestamp, verified, [scoutName+eventName+matchNumber]',
			scoutAchievements: '[scoutName+achievementId], scoutName, achievementId, unlockedAt',
		});

		this.version(2)
			.stores({
				scouts: 'name, Pis, pisFromPredictions, totalPredictions, correctPredictions, currentStreak, longestStreak, lastUpdated',
				predictions: 'id, scoutName, eventName, matchNumber, predictedWinner, timestamp, verified, [scoutName+eventName+matchNumber]',
				scoutAchievements: '[scoutName+achievementId], scoutName, achievementId, unlockedAt',
			})
			.upgrade((tx) => {
				return tx.table('scouts').toCollection().modify((scout) => {
					scout.pisFromPredictions = scout.pis || 0;
				});
			});

		this.version(3)
			.stores({
				scouts: 'name, pis, pisFromPredictions, totalPredictions, correctPredictions, currentStreak, longestStreak, lastUpdated',
				predictions: 'id, scoutName, eventName, matchNumber, predictedWinner, timestamp, verified, [scoutName+eventName+matchNumber]',
				scoutAchievements: '[scoutName+achievementId], scoutName, achievementId, unlockedAt',
			})
			.upgrade((tx) => {
				return tx.table('scouts').toCollection().modify((scout: Record<string, unknown>) => {
					const legacyPisValue = typeof scout.pis === 'number' ? scout.pis : 0;
					const legacyPisFromPredictions =
						typeof scout.pisFromPredictions === 'number' ? scout.pisFromPredictions : legacyPisValue;

					if (typeof scout.pis !== 'number') {
						scout.pis = legacyPisValue;
					}
					if (typeof scout.pisFromPredictions !== 'number') {
						scout.pisFromPredictions = legacyPisFromPredictions;
					}

					delete scout.pis;
					delete scout.pisFromPredictions;
				});
			});
	}
}

export const db = new SimpleScoutingAppDB();
export const pitDB = new PitScoutingDB();
export const gameDB = new ScoutProfileDB();

const safeStringify = (value: unknown): string | undefined => {
	if (value === null || value === undefined || value === '') {
		return undefined;
	}
	const str = String(value).trim();
	return str === '' ? undefined : str;
};

const enhanceEntry = (entry: ScoutingDataWithId): ScoutingEntryDB => {
	const rawData = entry.data;
	let actualData: Record<string, unknown> | undefined;

	if (rawData && typeof rawData === 'object') {
		if ('data' in rawData && typeof (rawData as Record<string, unknown>).data === 'object') {
			actualData = (rawData as { data: Record<string, unknown> }).data;
		} else {
			actualData = rawData as Record<string, unknown>;
		}
	}

	const dataSource = actualData ?? (rawData as Record<string, unknown>) ?? {};

	const matchNumber = safeStringify(dataSource['matchNumber']);
	const alliance = safeStringify(dataSource['alliance']);
	const scoutName = safeStringify(dataSource['scoutName']);
	const teamNumber = safeStringify(dataSource['selectTeam']);
	const eventName = safeStringify(dataSource['eventName']);

	return {
		id: entry.id,
		teamNumber,
		matchNumber,
		alliance,
		scoutName,
		eventName,
		data: dataSource,
		timestamp: entry.timestamp || Date.now(),
		synced: false,
	};
};

// MySQL utf8mb3 columns reject 4-byte UTF-8 (emoji, supplementary-plane chars).
// Strip surrogate pairs from any string before sync so server upserts don't fail.
const SUPPLEMENTARY_PLANE_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
const stripSupplementaryChars = <T>(value: T): T => {
	if (typeof value === 'string') {
		return value.replace(SUPPLEMENTARY_PLANE_RE, '') as T;
	}
	if (Array.isArray(value)) {
		return value.map(stripSupplementaryChars) as T;
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = stripSupplementaryChars(v);
		}
		return out as T;
	}
	return value;
};

const normalizeScoutingEntry = (entry: ScoutingEntryDB): ScoutingEntryDB => {
	const hasClientId = typeof entry.clientId === 'string' && entry.clientId.length > 0;
	const serverId = hasClientId ? Number(entry.id) : entry.serverId;

	return stripSupplementaryChars({
		...entry,
		id: entry.clientId ?? entry.id,
		serverId: Number.isFinite(serverId) ? serverId : entry.serverId,
		data: entry.data ?? {},
		synced: entry.synced ?? true,
	});
};

type PitEntryWithData = PitScoutingEntry & { data?: Record<string, unknown> };
type PitSaveResponse = { success?: boolean; entry?: PitEntryWithData };

const pitEntryPayload = (entry: PitScoutingEntry): PitEntryWithData =>
	stripSupplementaryChars({
		...entry,
		data: { ...entry },
	});

const mergePitEntry = (entry: PitEntryWithData): PitScoutingEntry => {
	const { data: nestedData, ...rest } = entry;
	return {
		...(typeof nestedData === 'object' && nestedData ? nestedData : {}),
		...rest,
	} as PitScoutingEntry;
};

const toQueryString = (params: Record<string, string | null | undefined>): string => {
	const searchParams = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== '') {
			searchParams.append(key, value);
		}
	});
	const query = searchParams.toString();
	return query ? `?${query}` : '';
};

const handleApiError = (context: string, error: unknown): void => {
	console.error(`[dexieDB] ${context}:`, error);
};

type SyncableRow = { id: string; synced?: boolean };

// Content fingerprint ignoring the sync flag, so "is this still the row we
// uploaded?" doesn't depend on whether it was already marked.
const rowFingerprint = (row: SyncableRow): string => {
	return JSON.stringify({ ...row, synced: undefined });
};

// Mark rows synced only if they still hold exactly what was uploaded. A scout
// can re-save an entry while its upload is in flight; writing the old snapshot
// back with synced:true used to overwrite that edit and hide it from every
// later sync pass.
const markRowsSynced = async <T extends SyncableRow>(table: Table<T, string>, sent: T[]): Promise<void> => {
	if (!sent.length) return;
	await table.db.transaction('rw', table, async () => {
		const current = await table.bulkGet(sent.map((row) => row.id));
		const confirmed = sent.filter((row, idx) => {
			const now = current[idx];
			return now !== undefined && rowFingerprint(now) === rowFingerprint(row);
		});
		await Promise.all(confirmed.map((row) => table.update(row.id, { synced: true } as never)));
	});
};

// Write server rows into the local cache without ever replacing a row that
// still has un-uploaded local changes. With `replaceAll`, rows the server no
// longer has are dropped too — except unsynced ones, which only exist here.
// Runs in one transaction so a save landing mid-refresh can't be wiped.
const mergeServerRows = async <T extends SyncableRow>(
	table: Table<T, string>,
	serverRows: T[],
	{ replaceAll = false }: { replaceAll?: boolean } = {},
): Promise<T[]> =>
	table.db.transaction('rw', table, async () => {
		const unsynced = await table.filter((row) => row.synced === false).toArray();
		const unsyncedIds = new Set(unsynced.map((row) => row.id));
		const incoming = serverRows
			.filter((row) => !unsyncedIds.has(row.id))
			.map((row) => ({ ...row, synced: true }));
		if (replaceAll) {
			const keep = new Set(incoming.map((row) => row.id));
			unsyncedIds.forEach((id) => keep.add(id));
			const allKeys = (await table.toCollection().primaryKeys()) as string[];
			await table.bulkDelete(allKeys.filter((key) => !keep.has(key)));
		}
		if (incoming.length) {
			await table.bulkPut(incoming);
		}
		return [...incoming, ...unsynced];
	});

// Ask the browser not to evict IndexedDB under storage pressure. Safari in
// particular clears site data for web apps it considers unused; persisted
// storage (granted to installed PWAs) is exempt.
export const requestPersistentStorage = async (): Promise<boolean> => {
	try {
		if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
		if (await navigator.storage.persisted()) return true;
		return await navigator.storage.persist();
	} catch {
		return false;
	}
};

const computeAllianceOptions = (entries: ScoutingEntryDB[]): string[] => {
	return [...new Set(entries.map((entry) => entry.alliance).filter((value): value is string => Boolean(value)))].sort();
};

const getLocalScoutingStats = async (): Promise<{
	totalEntries: number;
	teams: string[];
	matches: string[];
	scouts: string[];
	events: string[];
	oldestEntry?: number;
	newestEntry?: number;
}> => {
	const entries = await db.scoutingData.toArray();

	const teams = new Set<string>();
	const matches = new Set<string>();
	const scouts = new Set<string>();
	const events = new Set<string>();
	let oldestEntry: number | undefined;
	let newestEntry: number | undefined;

	entries.forEach((entry) => {
		if (entry.teamNumber) teams.add(entry.teamNumber);
		if (entry.matchNumber) matches.add(entry.matchNumber);
		if (entry.scoutName) scouts.add(entry.scoutName);
		if (entry.eventName) events.add(entry.eventName);

		if (!oldestEntry || entry.timestamp < oldestEntry) {
			oldestEntry = entry.timestamp;
		}
		if (!newestEntry || entry.timestamp > newestEntry) {
			newestEntry = entry.timestamp;
		}
	});

	return {
		totalEntries: entries.length,
		teams: Array.from(teams).sort((a, b) => Number(a) - Number(b)),
		matches: Array.from(matches).sort((a, b) => Number(a) - Number(b)),
		scouts: Array.from(scouts).sort(),
		events: Array.from(events).sort(),
		oldestEntry,
		newestEntry,
	};
};

const getLocalFilterOptions = async (): Promise<{
	teams: string[];
	matches: string[];
	events: string[];
	alliances: string[];
	scouts: string[];
}> => {
	const stats = await getLocalScoutingStats();
	const entries = await db.scoutingData.toArray();
	return {
		teams: stats.teams,
		matches: stats.matches,
		events: stats.events,
		alliances: computeAllianceOptions(entries),
		scouts: stats.scouts,
	};
};

const queryScoutingEntriesLocally = async (filters: {
	teamNumbers?: string[];
	matchNumbers?: string[];
	eventNames?: string[];
	alliances?: string[];
	scoutName?: string[];
	dateRange?: { start: number; end: number };
}): Promise<ScoutingEntryDB[]> => {
	let collection = db.scoutingData.toCollection();

	if (filters.dateRange) {
		collection = collection.filter(
			(entry) => entry.timestamp >= filters.dateRange!.start && entry.timestamp <= filters.dateRange!.end,
		);
	}

	if (filters.teamNumbers?.length) {
		const set = new Set(filters.teamNumbers);
		collection = collection.filter((entry) => Boolean(entry.teamNumber && set.has(entry.teamNumber)));
	}

	if (filters.matchNumbers?.length) {
		const set = new Set(filters.matchNumbers);
		collection = collection.filter((entry) => Boolean(entry.matchNumber && set.has(entry.matchNumber)));
	}

	if (filters.eventNames?.length) {
		const set = new Set(filters.eventNames);
		collection = collection.filter((entry) => Boolean(entry.eventName && set.has(entry.eventName)));
	}

	if (filters.alliances?.length) {
		const set = new Set(filters.alliances);
		collection = collection.filter((entry) => Boolean(entry.alliance && set.has(entry.alliance)));
	}

	if (filters.scoutName?.length) {
		const set = new Set(filters.scoutName);
		collection = collection.filter((entry) => Boolean(entry.scoutName && set.has(entry.scoutName)));
	}

	return collection.toArray();
};

// Local caches sync lazily through direct API calls in the functions below.

// Upload every unsynced row of a table. Rows go up in chunks so a long
// offline backlog (or pit entries carrying photos) never becomes one request
// big enough to time out or hit the server's body limit; a chunk whose bulk
// call fails is retried entry-by-entry so one bad row can't block the rest.
// Retrying is safe even if a bulk call partially succeeded server-side: every
// endpoint UPSERTs by the client-generated id, so a re-send updates in place
// and can never create a duplicate record.
const uploadUnsyncedRows = async <T extends SyncableRow & { teamNumber?: string }>({
	table,
	label,
	bulkPath,
	singlePath,
	toPayload,
	chunkSize,
	describe,
}: {
	table: Table<T, string>;
	label: string;
	bulkPath: string;
	singlePath: string;
	toPayload: (row: T) => unknown;
	chunkSize: number;
	describe: (row: T) => string;
}): Promise<void> => {
	const pendingEntries = await table.filter((row) => row.synced === false).toArray();
	if (!pendingEntries.length) return;
	const dismissSlowWarning = startSlowSyncWarning(label);
	const failures: { entry: T; reason: unknown }[] = [];
	try {
		for (let offset = 0; offset < pendingEntries.length; offset += chunkSize) {
			const chunk = pendingEntries.slice(offset, offset + chunkSize);
			try {
				// 45 s (vs the default 8 s): slow venue WiFi. Concurrent callers
				// are de-duped by the caller's promise, so this never stacks.
				await apiPost(bulkPath, withScoutingSeasonBody({ entries: chunk.map(toPayload) }), { timeoutMs: 45_000 });
				await markRowsSynced(table, chunk);
				continue;
			} catch (bulkError) {
				handleApiError(`bulk ${label.toLowerCase()} sync failed; falling back to per-entry`, bulkError);
			}
			const results = await Promise.allSettled(
				chunk.map((entry) =>
					apiPost(singlePath, withScoutingSeasonBody({ entry: toPayload(entry) }), { timeoutMs: 30_000 }).then(() => entry),
				),
			);
			const successes: T[] = [];
			results.forEach((result, idx) => {
				if (result.status === 'fulfilled') {
					successes.push(chunk[idx]);
				} else {
					failures.push({ entry: chunk[idx], reason: result.reason });
					handleApiError(`failed to sync ${describe(chunk[idx])}`, result.reason);
				}
			});
			await markRowsSynced(table, successes);
		}
	} finally {
		dismissSlowWarning();
	}
	if (failures.length > 0) {
		const sample = failures[0];
		const reason = sample.reason instanceof Error ? sample.reason.message : String(sample.reason);
		const status = sample.reason && typeof sample.reason === 'object' && 'status' in sample.reason
			? ` [HTTP ${(sample.reason as { status?: number }).status}]`
			: '';
		throw new Error(
			`${failures.length} of ${pendingEntries.length} ${label.toLowerCase()} entries failed: ${reason}${status} (${describe(sample.entry)})`,
		);
	}
};

let scoutingSyncPromise: Promise<void> | null = null;

export const syncCachedScoutingEntries = async (): Promise<void> => {
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return;
	}
	if (scoutingSyncPromise) {
		await scoutingSyncPromise;
		return;
	}
	scoutingSyncPromise = uploadUnsyncedRows<ScoutingEntryDB>({
		table: db.scoutingData,
		label: 'Scouting',
		bulkPath: '/scouting/bulk',
		singlePath: '/scouting',
		toPayload: normalizeScoutingEntry,
		chunkSize: 50,
		describe: (entry) => `entry ${entry.id} (team ${entry.teamNumber}, match ${entry.matchNumber})`,
	})
		.catch((error) => {
			handleApiError('failed to sync cached scouting entries', error);
			throw error;
		})
		.finally(() => {
			scoutingSyncPromise = null;
		});
	await scoutingSyncPromise;
};

let pitSyncPromise: Promise<void> | null = null;

export const syncCachedPitScoutingEntries = async (): Promise<void> => {
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return;
	}
	if (pitSyncPromise) {
		await pitSyncPromise;
		return;
	}
	pitSyncPromise = uploadUnsyncedRows<PitScoutingEntry>({
		table: pitDB.pitScoutingData,
		label: 'Pit',
		bulkPath: '/pit/bulk',
		singlePath: '/pit',
		toPayload: pitEntryPayload,
		// Pit entries can carry photos, so keep each request small.
		chunkSize: 5,
		describe: (entry) => `pit entry ${entry.id} (team ${entry.teamNumber})`,
	})
		.catch((error) => {
			handleApiError('failed to sync cached pit entries', error);
			throw error;
		})
		.finally(() => {
			pitSyncPromise = null;
		});
	await pitSyncPromise;
};

let gameSynced = false;
let gameSyncPromise: Promise<void> | null = null;

const ensureGameSynced = async (): Promise<void> => {
	if (gameSynced) return;
	if (gameSyncPromise) {
		await gameSyncPromise;
		return;
	}

	gameSyncPromise = (async () => {
		try {
			const [scouts, predictions, achievements] = await Promise.all([
				gameDB.scouts.toArray(),
				gameDB.predictions.toArray(),
				gameDB.scoutAchievements.toArray(),
			]);

			let pushFailures = 0;
			for (const scout of scouts) {
				try {
					await apiPost('/game/scouts', { scout });
				} catch (error) {
					pushFailures += 1;
					handleApiError(`failed to push scout ${scout.name}`, error);
				}
			}

			for (const prediction of predictions) {
				try {
					await apiPost('/game/predictions', { prediction });
					} catch (error) {
					pushFailures += 1;
					handleApiError(`failed to push prediction ${prediction.id}`, error);
				}
			}

			for (const achievement of achievements) {
				try {
					await apiPost('/game/achievements', { achievement });
					} catch (error) {
					pushFailures += 1;
					handleApiError(
						`failed to push achievement ${achievement.scoutName}/${achievement.achievementId}`,
						error,
					);
				}
			}

			const [{ scouts: remoteScouts }, { predictions: remotePredictions }, { achievements: remoteAchievements }] =
				await Promise.all([
					apiGet<{ scouts: Scout[] }>('/game/scouts'),
					apiGet<{ predictions: MatchPrediction[] }>('/game/predictions'),
					apiGet<{ achievements: ScoutAchievement[] }>('/game/achievements'),
				]);

			await gameDB.transaction('rw', gameDB.scouts, gameDB.predictions, gameDB.scoutAchievements, async () => {
				// Only mirror the server exactly when every local record made it up;
				// otherwise clearing would delete the ones whose upload failed.
				if (pushFailures === 0) {
					await gameDB.scouts.clear();
					await gameDB.predictions.clear();
					await gameDB.scoutAchievements.clear();
				}

				if (remoteScouts.length) {
					await gameDB.scouts.bulkPut(remoteScouts);
				}
				if (remotePredictions.length) {
					await gameDB.predictions.bulkPut(remotePredictions);
				}
				if (remoteAchievements.length) {
					await gameDB.scoutAchievements.bulkPut(remoteAchievements);
				}
			});

			gameSynced = pushFailures === 0;
		} catch (error) {
			handleApiError('game sync failed', error);
		} finally {
			gameSyncPromise = null;
		}
	})();

	await gameSyncPromise;
};

export const ensureGameDataSynced = async (): Promise<void> => {
	await ensureGameSynced();
};

db.open().catch((error) => {
	console.error('Failed to open Dexie database:', error);
});

pitDB.open().catch((error) => {
	console.error('Failed to open Pit Scouting database:', error);
});

gameDB.open().catch((error) => {
	console.error('Failed to open Scout Profile database:', error);
});

// Used by pendingScoutingQueue when recovering entries whose first local
// save failed: runs the same field extraction as saveScoutingEntry so the
// recovered row keeps its team/match/scout metadata. (The previous raw
// {id, data, timestamp} put left those indexed fields empty, which hid
// recovered entries from local team/match views until the next full sync.)
export const cacheScoutingEntryLocally = async (entry: ScoutingDataWithId): Promise<void> => {
	await db.scoutingData.put(enhanceEntry(entry));
};

export interface SaveScoutingEntryResult {
	syncedRemote: boolean;
	error?: { name?: string; message?: string };
}

export const saveScoutingEntry = async (entry: ScoutingDataWithId): Promise<SaveScoutingEntryResult> => {
	const enhancedEntry = enhanceEntry(entry);
	await recordLocalBackup('match', enhancedEntry);
	await db.scoutingData.put(enhancedEntry);

	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return { syncedRemote: false, error: { name: 'Offline', message: 'Device offline' } };
	}

	try {
		await apiPost('/scouting', withScoutingSeasonBody({ entry: normalizeScoutingEntry(enhancedEntry) }));
		await markRowsSynced(db.scoutingData, [enhancedEntry]);
		return { syncedRemote: true };
	} catch (error) {
		handleApiError('failed to persist scouting entry remotely', error);
		const e = error as Error & { status?: number };
		return {
			syncedRemote: false,
			error: { name: e?.name, message: e?.message },
		};
	}
};

export const saveScoutingEntries = async (entries: ScoutingDataWithId[]): Promise<void> => {
	const enhancedEntries = entries.map(enhanceEntry);
	for (const enhanced of enhancedEntries) {
		await recordLocalBackup('match', enhanced);
	}
	await db.scoutingData.bulkPut(enhancedEntries);

	try {
		// normalizeScoutingEntry also strips 4-byte UTF-8 (emoji) that the
		// MySQL columns reject — sending the raw entries here used to make the
		// upload fail for any entry with an emoji in its notes.
		await apiPost('/scouting/bulk', withScoutingSeasonBody({ entries: enhancedEntries.map(normalizeScoutingEntry) }));
		await markRowsSynced(db.scoutingData, enhancedEntries);
	} catch (error) {
		// Entries stay synced:false locally; the periodic sync in App.tsx
		// retries them, so a failure here is deferred, not lost.
		handleApiError('failed to persist scouting entries remotely', error);
	}
};

export const loadAllScoutingEntries = async (): Promise<ScoutingEntryDB[]> => {
	// A failed upload must not block reading: unsynced rows survive the merge.
	await syncCachedScoutingEntries().catch(() => {});

	try {
		const { entries } = await apiGet<{ entries: ScoutingEntryDB[] }>(
			`/scouting${toQueryString(withScoutingSeasonParams({}))}`,
		);
		return await mergeServerRows(db.scoutingData, entries.map(normalizeScoutingEntry), { replaceAll: true });
	} catch (error) {
		handleApiError('failed to load scouting entries from API', error);
		return db.scoutingData.toArray();
	}
};

export const loadScoutingEntriesByTeam = async (teamNumber: string): Promise<ScoutingEntryDB[]> => {
	try {
		const { entries } = await apiGet<{ entries: ScoutingEntryDB[] }>(
			`/scouting${toQueryString(withScoutingSeasonParams({ teamNumber }))}`,
		);
		await mergeServerRows(db.scoutingData, entries.map(normalizeScoutingEntry));
		return db.scoutingData.where('teamNumber').equals(teamNumber).toArray();
	} catch (error) {
		handleApiError('failed to load scouting entries by team from API', error);
		return db.scoutingData.where('teamNumber').equals(teamNumber).toArray();
	}
};

export const loadScoutingEntriesByMatch = async (matchNumber: string): Promise<ScoutingEntryDB[]> => {
	try {
		const { entries } = await apiGet<{ entries: ScoutingEntryDB[] }>(
			`/scouting${toQueryString(withScoutingSeasonParams({ matchNumber }))}`,
		);
		await mergeServerRows(db.scoutingData, entries.map(normalizeScoutingEntry));
		return db.scoutingData.where('matchNumber').equals(matchNumber).toArray();
	} catch (error) {
		handleApiError('failed to load scouting entries by match from API', error);
		return db.scoutingData.where('matchNumber').equals(matchNumber).toArray();
	}
};

export const loadScoutingEntriesByEvent = async (eventName: string): Promise<ScoutingEntryDB[]> => {
	try {
		const { entries } = await apiGet<{ entries: ScoutingEntryDB[] }>(
			`/scouting${toQueryString(withScoutingSeasonParams({ eventName }))}`,
		);
		await mergeServerRows(db.scoutingData, entries.map(normalizeScoutingEntry));
		return db.scoutingData.where('eventName').equals(eventName).toArray();
	} catch (error) {
		handleApiError('failed to load scouting entries by event from API', error);
		return db.scoutingData.where('eventName').equals(eventName).toArray();
	}
};

export const loadScoutingEntriesByTeamAndEvent = async (
	teamNumber: string,
	eventName: string,
): Promise<ScoutingEntryDB[]> => {
	try {
		const { entries } = await apiGet<{ entries: ScoutingEntryDB[] }>(
			`/scouting${toQueryString(withScoutingSeasonParams({ teamNumber, eventName }))}`,
		);
		await mergeServerRows(db.scoutingData, entries.map(normalizeScoutingEntry));
		return db.scoutingData
			.filter((entry) => entry.teamNumber === teamNumber && entry.eventName === eventName)
			.toArray();
	} catch (error) {
		handleApiError('failed to load scouting entries by team and event from API', error);
		return db.scoutingData
			.filter((entry) => entry.teamNumber === teamNumber && entry.eventName === eventName)
			.toArray();
	}
};

type ScoutingDeleteTarget = Pick<ScoutingEntryDB, 'id' | 'eventName'> | string | number;

const resolveDeleteTarget = (target: ScoutingDeleteTarget): { id: string; eventName?: string } => {
	if (typeof target === 'string' || typeof target === 'number') {
		return { id: String(target) };
	}

	return {
		id: String(target.id),
		eventName: target.eventName,
	};
};

export const deleteScoutingEntry = async (target: ScoutingDeleteTarget): Promise<void> => {
	const { id, eventName } = resolveDeleteTarget(target);

	try {
		await apiDelete(
			`/scouting/${encodeURIComponent(id)}${toQueryString(withScoutingSeasonParams({ eventName }))}`,
		);
		await db.scoutingData.delete(id);
	} catch (error) {
		handleApiError(`failed to delete scouting entry ${id}`, error);
		throw error;
	}
};

export const deleteScoutingEntries = async (targets: ScoutingDeleteTarget[]): Promise<void> => {
	const deleteTargets = targets.map(resolveDeleteTarget);
	const ids = deleteTargets.map(({ id }) => id);

	try {
		await Promise.all(
			deleteTargets.map(({ id, eventName }) =>
				apiDelete(
					`/scouting/${encodeURIComponent(id)}${toQueryString(withScoutingSeasonParams({ eventName }))}`,
				),
			),
		);
		await db.scoutingData.bulkDelete(ids);
	} catch (error) {
		handleApiError('failed to delete scouting entries batch', error);
		throw error;
	}
};

export const clearAllScoutingData = async (): Promise<void> => {
	try {
		await apiDelete(`/scouting${toQueryString(withScoutingSeasonParams({}))}`);
		await db.scoutingData.clear();
	} catch (error) {
		handleApiError('failed to clear scouting data remotely', error);
		throw error;
	}
};

export const getDBStats = async (): Promise<{
	totalEntries: number;
	teams: string[];
	matches: string[];
	scouts: string[];
	events: string[];
	oldestEntry?: number;
	newestEntry?: number;
}> => {
	try {
		return await apiGet<{
			totalEntries: number;
			teams: string[];
			matches: string[];
			scouts: string[];
			events: string[];
			oldestEntry?: number;
			newestEntry?: number;
		}>(`/scouting/stats${toQueryString(withScoutingSeasonParams({}))}`);
	} catch (error) {
		handleApiError('failed to fetch scouting stats from API', error);
		return getLocalScoutingStats();
	}
};

export const migrateFromLocalStorage = async (): Promise<{
	success: boolean;
	migratedCount: number;
	error?: string;
}> => {
	try {
		const existingDataStr = localStorage.getItem('scoutingData');
		if (!existingDataStr) {
			return { success: true, migratedCount: 0 };
		}

		const { migrateToIdStructure, hasIdStructure } = await import('./scoutingDataUtils');

		const parsed = JSON.parse(existingDataStr);
		let dataToMigrate: { entries: ScoutingDataWithId[] };

		if (hasIdStructure(parsed)) {
			dataToMigrate = parsed;
		} else {
			dataToMigrate = migrateToIdStructure(parsed);
		}

		await saveScoutingEntries(dataToMigrate.entries);

		localStorage.setItem('scoutingData_backup', existingDataStr);
		localStorage.removeItem('scoutingData');

		return {
			success: true,
			migratedCount: dataToMigrate.entries.length,
		};
	} catch (error) {
		handleApiError('migration from localStorage failed', error);
		return {
			success: false,
			migratedCount: 0,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
};

export const migrateFromIndexedDB = async (): Promise<{
	success: boolean;
	migratedCount: number;
	error?: string;
}> => {
	try {
		const { loadAllScoutingEntries: loadOldEntries } = await import('./indexedDBUtils');

		const oldEntries = await loadOldEntries();
		if (oldEntries.length === 0) {
			return { success: true, migratedCount: 0 };
		}

		const convertedEntries: ScoutingDataWithId[] = oldEntries.map((item) => ({
			id: item.id,
			data: item.data,
			timestamp: item.timestamp,
		}));

		await saveScoutingEntries(convertedEntries);

		return {
			success: true,
			migratedCount: convertedEntries.length,
		};
	} catch (error) {
		handleApiError('migration from IndexedDB failed', error);
		return {
			success: false,
			migratedCount: 0,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
};

export const exportScoutingData = async (): Promise<{
	entries: ScoutingEntryDB[];
	exportedAt: number;
	version: string;
}> => {
	try {
		const { entries, exportedAt, version } = await apiGet<{
			entries: ScoutingEntryDB[];
			exportedAt: number;
			version: string;
		}>(`/scouting/export${toQueryString(withScoutingSeasonParams({}))}`);
		return {
			entries: entries.map(normalizeScoutingEntry),
			exportedAt,
			version,
		};
	} catch (error) {
		handleApiError('failed to export scouting data from API', error);
		const entries = await db.scoutingData.toArray();
		return {
			entries,
			exportedAt: Date.now(),
			version: '2.0-dexie',
		};
	}
};

export const importScoutingData = async (
	importData: { entries: ScoutingEntryDB[] },
	mode: 'append' | 'overwrite' = 'append',
): Promise<{
	success: boolean;
	importedCount: number;
	duplicatesSkipped?: number;
	error?: string;
}> => {
	// Store locally as unsynced first: if the upload fails, the periodic sync
	// retries it instead of the imported data only existing in the file.
	const normalized = importData.entries.map((entry) => ({ ...normalizeScoutingEntry(entry), synced: false }));
	try {
		if (mode === 'overwrite') {
			await db.transaction('rw', db.scoutingData, async () => {
				await db.scoutingData.clear();
				await db.scoutingData.bulkPut(normalized);
			});
		} else if (normalized.length) {
			await db.scoutingData.bulkPut(normalized);
		}

		const response = await apiPost<{ success: boolean; importedCount: number }>(
			'/scouting/import',
			withScoutingSeasonBody({
				entries: normalized,
				mode,
			}),
		);
		await markRowsSynced(db.scoutingData, normalized);

		return {
			success: response.success,
			importedCount: response.importedCount,
		};
	} catch (error) {
		handleApiError('failed to import scouting data via API', error);
		return {
			success: false,
			importedCount: 0,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
};

export const queryScoutingEntries = async (filters: {
	teamNumbers?: string[];
	matchNumbers?: string[];
	eventNames?: string[];
	alliances?: string[];
	scoutName?: string[];
	dateRange?: { start: number; end: number };
}): Promise<ScoutingEntryDB[]> => {
	try {
		const { entries } = await apiPost<{ entries: ScoutingEntryDB[] }>(
			'/scouting/query',
			withScoutingSeasonBody({ filters }),
		);
		await mergeServerRows(db.scoutingData, entries.map(normalizeScoutingEntry));
		return queryScoutingEntriesLocally(filters);
	} catch (error) {
		handleApiError('failed to query scouting entries via API', error);
		return queryScoutingEntriesLocally(filters);
	}
};

export const getFilterOptions = async (): Promise<{
	teams: string[];
	matches: string[];
	events: string[];
	alliances: string[];
	scouts: string[];
}> => {
	try {
		const [stats, entriesResponse] = await Promise.all([
			apiGet<{
				totalEntries: number;
				teams: string[];
				matches: string[];
				scouts: string[];
				events: string[];
				oldestEntry?: number;
				newestEntry?: number;
			}>(`/scouting/stats${toQueryString(withScoutingSeasonParams({}))}`),
			apiGet<{ entries: ScoutingEntryDB[] }>(`/scouting${toQueryString(withScoutingSeasonParams({}))}`),
		]);

		const normalized = entriesResponse.entries.map(normalizeScoutingEntry);
		await mergeServerRows(db.scoutingData, normalized, { replaceAll: true });

		return {
			teams: stats.teams,
			matches: stats.matches,
			events: stats.events,
			alliances: computeAllianceOptions(normalized),
			scouts: stats.scouts,
		};
	} catch (error) {
		handleApiError('failed to fetch filter options from API', error);
		return getLocalFilterOptions();
	}
};

export const savePitScoutingEntry = async (entry: PitScoutingEntry): Promise<PitScoutingEntry> => {
	const unsynced = { ...entry, synced: false };
	await recordLocalBackup('pit', unsynced);
	await pitDB.pitScoutingData.put(unsynced);

	try {
		const response = await apiPost<PitSaveResponse>('/pit', withScoutingSeasonBody({ entry: pitEntryPayload(unsynced) }));
		await markRowsSynced(pitDB.pitScoutingData, [unsynced]);
		return response.entry ? { ...mergePitEntry(response.entry), synced: true } : { ...unsynced, synced: true };
	} catch (error) {
		handleApiError('failed to persist pit scouting entry remotely', error);
		return unsynced;
	}
};

export const loadAllPitScoutingEntries = async (): Promise<PitScoutingEntry[]> => {
	// Push any unsynced local entries before fetching from server. A failed
	// upload must not block reading: unsynced rows survive the merge.
	await syncCachedPitScoutingEntries().catch(() => {});

	try {
		const { entries } = await apiGet<{ entries: PitEntryWithData[] }>(
			`/pit${toQueryString(withScoutingSeasonParams({}))}`,
		);
		return await mergeServerRows(pitDB.pitScoutingData, entries.map(mergePitEntry), { replaceAll: true });
	} catch (error) {
		handleApiError('failed to load pit scouting entries from API', error);
		return pitDB.pitScoutingData.toArray();
	}
};


export const loadPitScoutingByTeam = async (teamNumber: string): Promise<PitScoutingEntry[]> => {
	try {
		const { entries } = await apiGet<{ entries: PitEntryWithData[] }>(
			`/pit${toQueryString(withScoutingSeasonParams({ teamNumber }))}`,
		);
		await mergeServerRows(pitDB.pitScoutingData, entries.map(mergePitEntry));
		return pitDB.pitScoutingData.where('teamNumber').equals(teamNumber).toArray();
	} catch (error) {
		handleApiError('failed to load pit scouting entries by team', error);
		return pitDB.pitScoutingData.where('teamNumber').equals(teamNumber).toArray();
	}
};

export const loadPitScoutingByEvent = async (eventName: string): Promise<PitScoutingEntry[]> => {
	try {
		const { entries } = await apiGet<{ entries: PitEntryWithData[] }>(
			`/pit${toQueryString(withScoutingSeasonParams({ eventName }))}`,
		);
		await mergeServerRows(pitDB.pitScoutingData, entries.map(mergePitEntry));
		return pitDB.pitScoutingData.where('eventName').equals(eventName).toArray();
	} catch (error) {
		handleApiError('failed to load pit scouting entries by event', error);
		return pitDB.pitScoutingData.where('eventName').equals(eventName).toArray();
	}
};

export const loadPitScoutingByTeamAndEvent = async (
	teamNumber: string,
	eventName: string,
): Promise<PitScoutingEntry | undefined> => {
	try {
		// Offline: skip the request instead of stalling a pit save on its timeout.
		if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline');
		const { entries } = await apiGet<{ entries: PitEntryWithData[] }>(
			`/pit${toQueryString(withScoutingSeasonParams({ teamNumber, eventName }))}`,
		);
		const merged = await mergeServerRows(pitDB.pitScoutingData, entries.map(mergePitEntry));
		// An unsynced local edit wins over the server copy of the same entry.
		return merged
			.filter((entry) => entry.teamNumber === teamNumber && entry.eventName === eventName)
			.sort((a, b) => b.timestamp - a.timestamp)[0];
	} catch (error) {
		handleApiError('failed to load pit scouting entry by team and event', error);
		const results = await pitDB.pitScoutingData
			.where('[teamNumber+eventName]')
			.equals([teamNumber, eventName])
			.toArray();
		return results.sort((a, b) => b.timestamp - a.timestamp)[0];
	}
};

export const deletePitScoutingEntry = async (id: string): Promise<void> => {
	try {
		await apiDelete(`/pit/${encodeURIComponent(id)}${toQueryString(withScoutingSeasonParams({}))}`);
		await pitDB.pitScoutingData.delete(id);
	} catch (error) {
		handleApiError(`failed to delete pit scouting entry ${id}`, error);
		throw error;
	}
};

export const clearAllPitScoutingData = async (): Promise<void> => {
	try {
		await apiDelete(`/pit${toQueryString(withScoutingSeasonParams({}))}`);
		await pitDB.pitScoutingData.clear();
	} catch (error) {
		handleApiError('failed to clear pit scouting data remotely', error);
		throw error;
	}
};

export const getPitScoutingStats = async (): Promise<{
	totalEntries: number;
	teams: string[];
	events: string[];
	scouts: string[];
}> => {
	try {
		return await apiGet<{
			totalEntries: number;
			teams: string[];
			events: string[];
			scouts: string[];
		}>(`/pit/stats${toQueryString(withScoutingSeasonParams({}))}`);
	} catch (error) {
		handleApiError('failed to fetch pit scouting stats from API', error);
		const entries = await pitDB.pitScoutingData.toArray();

		const teams = [...new Set(entries.map((entry) => entry.teamNumber))].sort((a, b) => Number(a) - Number(b));
		const events = [...new Set(entries.map((entry) => entry.eventName))].sort();
		const scouts = [...new Set(entries.map((entry) => entry.scoutName))].sort();

		return {
			totalEntries: entries.length,
			teams,
			events,
			scouts,
		};
	}
};

export const getOrCreateScout = async (name: string): Promise<Scout> => {
	const trimmed = name.trim();
	await ensureGameSynced();

	const scout = await gameDB.scouts.get(trimmed);

	if (scout) {
		scout.lastUpdated = Date.now();
		await gameDB.scouts.put(scout);
		try {
			await apiPatch(`/game/scouts/${encodeURIComponent(trimmed)}`, {
				updates: { lastUpdated: scout.lastUpdated },
			});
		} catch (error) {
			handleApiError(`failed to touch scout ${trimmed} remotely`, error);
		}
		return scout;
	}

	const newScout: Scout = {
		name: trimmed,
		pis: 0,
		pisFromPredictions: 0,
		totalPredictions: 0,
		correctPredictions: 0,
		currentStreak: 0,
		longestStreak: 0,
		createdAt: Date.now(),
		lastUpdated: Date.now(),
	};

	await gameDB.scouts.put(newScout);

	try {
		const { scout: createdScout } = await apiPost<{ scout: Scout }>('/game/scouts', { scout: newScout });
		if (createdScout) {
			await gameDB.scouts.put(createdScout);
			return createdScout;
		}
	} catch (error) {
		handleApiError(`failed to create scout ${trimmed} remotely`, error);
	}

	gameSynced = false;
	return newScout;
};

export const getScout = async (name: string): Promise<Scout | undefined> => {
	try {
		const { scout } = await apiGet<{ scout: Scout }>(`/game/scouts/${encodeURIComponent(name)}`);
		await gameDB.scouts.put(scout);
		return scout;
	} catch (error) {
		handleApiError(`failed to fetch scout ${name} from API`, error);
		return gameDB.scouts.get(name);
	}
};

export const getAllScouts = async (): Promise<Scout[]> => {
	try {
		const { scouts } = await apiGet<{ scouts: Scout[] }>('/game/scouts');
		if (scouts.length) {
			await gameDB.scouts.clear();
			await gameDB.scouts.bulkPut(scouts);
		}
		gameSynced = true;
		return scouts;
	} catch (error) {
		handleApiError('failed to fetch scouts from API', error);
		return gameDB.scouts.orderBy('pis').reverse().toArray();
	}
};

export const updateScoutPoints = async (name: string, pointsToAdd: number): Promise<void> => {
	const scout = await gameDB.scouts.get(name);
	if (!scout) return;

	scout.pis += pointsToAdd;
	scout.lastUpdated = Date.now();
	await gameDB.scouts.put(scout);

	try {
		await apiPatch(`/game/scouts/${encodeURIComponent(name)}`, {
			updates: {
				pis: scout.pis,
				pisFromPredictions: scout.pisFromPredictions,
				totalPredictions: scout.totalPredictions,
				correctPredictions: scout.correctPredictions,
				currentStreak: scout.currentStreak,
				longestStreak: scout.longestStreak,
			},
		});
		gameSynced = false;
	} catch (error) {
		handleApiError(`failed to update scout points for ${name} remotely`, error);
	}
};

export const updateScoutStats = async (
	name: string,
	newPis: number,
	correctPredictions: number,
	totalPredictions: number,
	currentStreak?: number,
	longestStreak?: number,
	additionalPisFromPredictions: number = 0,
): Promise<void> => {
	const scout = await gameDB.scouts.get(name);
	if (!scout) return;

	scout.pis = newPis;
	scout.pisFromPredictions += additionalPisFromPredictions;
	scout.correctPredictions = correctPredictions;
	scout.totalPredictions = totalPredictions;
	if (typeof currentStreak === 'number') {
		scout.currentStreak = currentStreak;
	}
	if (typeof longestStreak === 'number') {
		scout.longestStreak = longestStreak;
	}
	scout.lastUpdated = Date.now();

	await gameDB.scouts.put(scout);

	try {
		await apiPatch(`/game/scouts/${encodeURIComponent(name)}`, {
			updates: {
				pis: scout.pis,
				pisFromPredictions: scout.pisFromPredictions,
				totalPredictions: scout.totalPredictions,
				correctPredictions: scout.correctPredictions,
				currentStreak: scout.currentStreak,
				longestStreak: scout.longestStreak,
			},
		});
		gameSynced = false;
	} catch (error) {
		handleApiError(`failed to update scout stats for ${name} remotely`, error);
	}
};

export const updateScoutWithPredictionResult = async (
	name: string,
	isCorrect: boolean,
	basePoints: number,
	eventName: string,
	matchNumber: string,
	wager?: number,
): Promise<number> => {
	const scout = await gameDB.scouts.get(name);
	if (!scout) return 0;

		const wagerValue = typeof wager === 'number' && wager > 0 ? Math.floor(wager) : 0;
		let pointsAwarded = 0;
	let newCurrentStreak = scout.currentStreak;
	let newLongestStreak = scout.longestStreak;

	const isSequential = await isMatchSequential(name, eventName, matchNumber);

		if (isCorrect) {
			pointsAwarded += (wagerValue > 0 ? wagerValue : basePoints);

		if (isSequential || scout.totalPredictions === 0) {
			newCurrentStreak += 1;
		} else {
			newCurrentStreak = 1;
		}

		if (newCurrentStreak > newLongestStreak) {
			newLongestStreak = newCurrentStreak;
		}

		if (newCurrentStreak >= 2) {
			const streakBonus = 2 * (newCurrentStreak - 1);
			pointsAwarded += streakBonus;
		}
		} else {
			newCurrentStreak = 0;
			if (wagerValue > 0) {
				pointsAwarded -= wagerValue;
			} else {
				// Default penalty of 1 if no wager provided
				pointsAwarded -= 1;
			}
	}

		await updateScoutStats(
		name,
		scout.pis + pointsAwarded,
		scout.correctPredictions + (isCorrect ? 1 : 0),
		scout.totalPredictions,
		newCurrentStreak,
		newLongestStreak,
		pointsAwarded,
	);

	return pointsAwarded;
};

const isMatchSequential = async (
	scoutName: string,
	eventName: string,
	currentMatchNumber: string,
): Promise<boolean> => {
	const lastPrediction = await gameDB.predictions
		.where('scoutName')
		.equals(scoutName)
		.and((prediction) => prediction.eventName === eventName && prediction.verified)
		.reverse()
		.sortBy('timestamp');

	if (!lastPrediction || lastPrediction.length === 0) {
		return true;
	}

	const lastMatchNumber = parseInt(lastPrediction[0].matchNumber, 10);
	const currentMatch = parseInt(currentMatchNumber, 10);
	const gap = currentMatch - lastMatchNumber;

	return gap <= 3 && gap > 0;
};

export const createMatchPrediction = async (
	scoutName: string,
	eventName: string,
	matchNumber: string,
	predictedWinner: 'red' | 'blue',
	wager?: number,
): Promise<MatchPrediction> => {
	await ensureGameSynced();

	const existingPrediction = await gameDB.predictions
		.where('[scoutName+eventName+matchNumber]')
		.equals([scoutName, eventName, matchNumber])
		.first();

		if (existingPrediction) {
			existingPrediction.predictedWinner = predictedWinner;
			if (typeof wager === 'number') {
				(existingPrediction as MatchPrediction).wager = Math.floor(Math.max(0, wager));
			}
		existingPrediction.timestamp = Date.now();
		await gameDB.predictions.put(existingPrediction);

		try {
				await apiPost('/game/predictions', { prediction: existingPrediction });
			gameSynced = false;
		} catch (error) {
			handleApiError(`failed to update prediction ${existingPrediction.id} remotely`, error);
		}

		return existingPrediction;
	}

		const prediction: MatchPrediction = {
		id: `prediction_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
		scoutName,
		eventName,
		matchNumber,
		predictedWinner,
			wager: typeof wager === 'number' ? Math.floor(Math.max(0, wager)) : undefined,
		timestamp: Date.now(),
		verified: false,
	};

	await gameDB.predictions.put(prediction);

	try {
		const { prediction: remotePrediction } = await apiPost<{ prediction: MatchPrediction }>('/game/predictions', {
			prediction,
		});
		if (remotePrediction) {
			await gameDB.predictions.put(remotePrediction);
		}
		gameSynced = false;
	} catch (error) {
		handleApiError('failed to persist prediction remotely', error);
	}

	const scout = await gameDB.scouts.get(scoutName);
	if (scout) {
		scout.totalPredictions += 1;
		scout.lastUpdated = Date.now();
		await gameDB.scouts.put(scout);

		try {
			await apiPatch(`/game/scouts/${encodeURIComponent(scoutName)}`, {
				updates: {
					totalPredictions: scout.totalPredictions,
					lastUpdated: scout.lastUpdated,
				},
			});
			gameSynced = false;
		} catch (error) {
			handleApiError(`failed to sync prediction count for ${scoutName}`, error);
		}

		const { checkForNewAchievements } = await import('./achievementUtils');
		const newAchievements = await checkForNewAchievements(scoutName);

		if (newAchievements.length > 0) {
			console.log('🏆 New achievements unlocked for', scoutName, ':', newAchievements.map((a) => a.name));
		}
	}

	return prediction;
};

export const getPredictionForMatch = async (
	scoutName: string,
	eventName: string,
	matchNumber: string,
): Promise<MatchPrediction | undefined> => {
	try {
		const { predictions } = await apiGet<{ predictions: MatchPrediction[] }>(
			`/game/predictions${toQueryString({ scoutName, eventName, matchNumber })}`,
		);
		if (predictions.length) {
			await gameDB.predictions.put(predictions[0]);
			return predictions[0];
		}
	} catch (error) {
		handleApiError('failed to fetch prediction for match remotely', error);
	}

	return gameDB.predictions
		.where('[scoutName+eventName+matchNumber]')
		.equals([scoutName, eventName, matchNumber])
		.first();
};

export const getAllPredictionsForScout = async (scoutName: string): Promise<MatchPrediction[]> => {
	try {
		const { predictions } = await apiGet<{ predictions: MatchPrediction[] }>(
			`/game/predictions${toQueryString({ scoutName })}`,
		);
		if (predictions.length) {
			await gameDB.predictions.bulkPut(predictions);
		}
		return predictions;
	} catch (error) {
		handleApiError(`failed to fetch predictions for scout ${scoutName}`, error);
		return gameDB.predictions.where('scoutName').equals(scoutName).reverse().toArray();
	}
};

export const getAllPredictionsForMatch = async (
	eventName: string,
	matchNumber: string,
): Promise<MatchPrediction[]> => {
	try {
		const { predictions } = await apiGet<{ predictions: MatchPrediction[] }>(
			`/game/predictions${toQueryString({ eventName, matchNumber })}`,
		);
		if (predictions.length) {
			await gameDB.predictions.bulkPut(predictions);
		}
		return predictions;
	} catch (error) {
		handleApiError(`failed to fetch predictions for match ${eventName}-${matchNumber}`, error);
		return gameDB.predictions
			.where('eventName')
			.equals(eventName)
			.and((prediction) => prediction.matchNumber === matchNumber)
			.toArray();
	}
};

interface PredictionVerificationPayload {
	actualWinner?: 'red' | 'blue' | 'tie' | '';
	isCorrect?: boolean;
	pointsAwarded?: number;
	timestamp?: number;
}

export const markPredictionAsVerified = async (
	predictionId: string,
	updates: PredictionVerificationPayload = {},
): Promise<void> => {
	const timestamp = updates.timestamp ?? Date.now();
	const patchUpdates: Record<string, unknown> = {
		verified: true,
		timestamp,
	};

	if (updates.actualWinner !== undefined) {
		patchUpdates.actualWinner = updates.actualWinner;
	}
	if (updates.isCorrect !== undefined) {
		patchUpdates.isCorrect = updates.isCorrect;
	}
	if (updates.pointsAwarded !== undefined) {
		patchUpdates.pointsAwarded = updates.pointsAwarded;
	}

	try {
		await apiPatch(`/game/predictions/${encodeURIComponent(predictionId)}`, {
			updates: patchUpdates,
		});
	} catch (error) {
		handleApiError(`failed to mark prediction ${predictionId} as verified`, error);
		throw error;
	}

	const localUpdates: Partial<MatchPrediction> = {
		verified: true,
		timestamp,
	};
	if (updates.actualWinner !== undefined) {
		localUpdates.actualWinner = updates.actualWinner || undefined;
	}
	if (updates.isCorrect !== undefined) {
		localUpdates.isCorrect = updates.isCorrect;
	}
	if (updates.pointsAwarded !== undefined) {
		localUpdates.pointsAwarded = updates.pointsAwarded;
	}

	await gameDB.predictions.update(predictionId, localUpdates);
	gameSynced = false;
};

export const reconcileScoutPredictionStats = async (
	scoutNames: string[],
): Promise<Record<string, { totalPredictions: number; correctPredictions: number }>> => {
	const uniqueNames = Array.from(
		new Set(
			scoutNames
				.map((name) => (typeof name === 'string' ? name.trim() : ''))
				.filter((name) => name.length > 0),
		),
	);

	if (!uniqueNames.length) {
		return {};
	}

	const corrections: Record<string, { totalPredictions: number; correctPredictions: number }> = {};

	for (const name of uniqueNames) {
		let predictions: MatchPrediction[] = [];
		try {
			predictions = await getAllPredictionsForScout(name);
		} catch (error) {
			handleApiError(`failed to load predictions for ${name} during analytics reconciliation`, error);
			predictions = await gameDB.predictions.where('scoutName').equals(name).toArray();
		}

		const totalPredictions = predictions.length;
		const correctPredictions = predictions.filter((prediction) => {
			if (prediction.isCorrect !== undefined) {
				return prediction.isCorrect;
			}
			if (!prediction.verified) {
				return false;
			}
			if (!prediction.actualWinner) {
				return false;
			}
			return prediction.predictedWinner === prediction.actualWinner;
		}).length;

		const scout = await gameDB.scouts.get(name);
		if (!scout) {
			continue;
		}

		if (scout.totalPredictions !== totalPredictions || scout.correctPredictions !== correctPredictions) {
			await updateScoutStats(
				name,
				scout.pis,
				correctPredictions,
				totalPredictions,
				scout.currentStreak,
				scout.longestStreak,
			);
			const refreshed = await gameDB.scouts.get(name);
			if (refreshed) {
				corrections[name] = {
					totalPredictions: refreshed.totalPredictions,
					correctPredictions: refreshed.correctPredictions,
				};
			}
		} else {
			corrections[name] = {
				totalPredictions: scout.totalPredictions,
				correctPredictions: scout.correctPredictions,
			};
		}
	}

	return corrections;
};

export const deleteScout = async (name: string): Promise<void> => {
	try {
		await apiDelete(`/game/scouts/${encodeURIComponent(name)}`);
		await gameDB.scouts.delete(name);
		await gameDB.predictions.where('scoutName').equals(name).delete();
		await gameDB.scoutAchievements.where('scoutName').equals(name).delete();
		gameSynced = false;
	} catch (error) {
		handleApiError(`failed to delete scout ${name}`, error);
		throw error;
	}
};

export const clearGameData = async (): Promise<void> => {
	try {
		await apiDelete('/game/scouts');
		await gameDB.scouts.clear();
		await gameDB.predictions.clear();
		await gameDB.scoutAchievements.clear();
		gameSynced = false;
	} catch (error) {
		handleApiError('failed to clear game data remotely', error);
		throw error;
	}
};
