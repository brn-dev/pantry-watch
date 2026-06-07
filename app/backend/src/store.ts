import type { Household, PantryItem, PantryLocation as Location, ShoppingListItem } from "@shared/models";
import { MongoClient, type Collection } from "mongodb";

export type StoredHousehold = Household & {
  accessToken: string;
  storageRevision?: number;
};

const defaultHouseholds: StoredHousehold[] = [
  {
    id: "household-1",
    name: "Default Household",
    accessToken: "default-token",
    storageRevision: 0,
    locations: [
      {
        id: "loc-fridge",
        name: "Fridge",
        items: [
          { id: "item-milk", name: "Milk", quantity: 1, unit: "liter", expirationDate: "2026-04-25" },
          { id: "item-eggs", name: "Eggs", quantity: 6, unit: "pieces", expirationDate: "2026-04-28" }
        ]
      },
      {
        id: "loc-pantry",
        name: "Pantry",
        items: [{ id: "item-pasta", name: "Pasta", quantity: 2, unit: "packs", expirationDate: "2026-05-25" }]
      }
    ],
    shoppingList: [
      { id: "shopping-item-bread", name: "Bread", amount: "1 loaf", shop: "Bakery", done: false },
      { id: "shopping-item-tomatoes", name: "Tomatoes", amount: "500 g", shop: "Supermarket", done: true }
    ]
  }
];

let idCounter = 1;
let mongoClient: MongoClient | null = null;
let householdsCollection: Collection<StoredHousehold> | null = null;

export class StoreNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreNotFoundError";
  }
}

const getMongoConnectionString = (): string => {
  const connectionString = process.env.MONGO_DB_CONN_STRING?.trim();
  if (!connectionString) {
    throw new Error("MONGO_DB_CONN_STRING is required.");
  }

  return connectionString;
};

const getMongoDatabaseName = (connectionString: string): string => {
  if (process.env.MONGO_DB_NAME?.trim()) {
    return process.env.MONGO_DB_NAME.trim();
  }

  try {
    const databaseName = new URL(connectionString).pathname.replace(/^\/+/u, "").trim();
    return databaseName || "pantry-watch";
  } catch {
    return "pantry-watch";
  }
};

const getHouseholdsCollection = (): Collection<StoredHousehold> => {
  if (!householdsCollection) {
    throw new Error("MongoDB storage has not been initialized.");
  }

  return householdsCollection;
};

export const initializeStore = async (): Promise<void> => {
  const connectionString = getMongoConnectionString();
  mongoClient = new MongoClient(connectionString);
  await mongoClient.connect();

  const databaseName = getMongoDatabaseName(connectionString);
  householdsCollection = mongoClient.db(databaseName).collection<StoredHousehold>("households");
  await householdsCollection.createIndex({ id: 1 }, { unique: true });
  await householdsCollection.createIndex({ accessToken: 1 });
  await householdsCollection.updateMany({ storageRevision: { $exists: false } }, { $set: { storageRevision: 0 } });

  const existingHouseholdCount = await householdsCollection.countDocuments({}, { limit: 1 });
  if (existingHouseholdCount === 0) {
    await householdsCollection.insertMany(defaultHouseholds);
  }
};

export const makeId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
};

export const publicHouseholds = async (): Promise<Household[]> => {
  const households = await getHouseholdsCollection()
    .find({}, { projection: { _id: 0, accessToken: 0, storageRevision: 0 } })
    .toArray();
  return households;
};

export const findHousehold = async (householdId: string): Promise<StoredHousehold | null> => {
  return getHouseholdsCollection().findOne({ id: householdId }, { projection: { _id: 0 } });
};

const requireMatchedHouseholdUpdate = async (
  householdId: string,
  matchedCount: number,
  notFoundMessage: string
): Promise<void> => {
  if (matchedCount > 0) {
    return;
  }

  const householdExists = await getHouseholdsCollection().findOne({ id: householdId }, { projection: { _id: 1 } });
  if (!householdExists) {
    throw new Error(`Household ${householdId} does not exist.`);
  }

  throw new StoreNotFoundError(notFoundMessage);
};

export const addLocation = async (householdId: string, location: Location): Promise<boolean> => {
  const result = await getHouseholdsCollection().updateOne(
    { id: householdId, locations: { $not: { $elemMatch: { name: location.name } } } },
    { $push: { locations: location }, $inc: { storageRevision: 1 } },
    { collation: { locale: "en", strength: 2 } }
  );

  return result.modifiedCount > 0;
};

export const renameLocation = async (householdId: string, locationId: string, name: string): Promise<boolean> => {
  const result = await getHouseholdsCollection().updateOne(
    {
      id: householdId,
      locations: {
        $elemMatch: { id: locationId },
        $not: { $elemMatch: { id: { $ne: locationId }, name } }
      }
    },
    { $set: { "locations.$[location].name": name }, $inc: { storageRevision: 1 } },
    {
      arrayFilters: [{ "location.id": locationId }],
      collation: { locale: "en", strength: 2 }
    }
  );

  return result.modifiedCount > 0;
};

export const deleteLocation = async (householdId: string, locationId: string): Promise<void> => {
  const result = await getHouseholdsCollection().updateOne(
    { id: householdId, "locations.id": locationId },
    { $pull: { locations: { id: locationId } }, $inc: { storageRevision: 1 } }
  );

  await requireMatchedHouseholdUpdate(householdId, result.matchedCount, "Location not found.");
};

export const addPantryItem = async (householdId: string, locationId: string, item: PantryItem): Promise<void> => {
  const result = await getHouseholdsCollection().updateOne(
    { id: householdId, "locations.id": locationId },
    { $push: { "locations.$.items": item }, $inc: { storageRevision: 1 } }
  );

  await requireMatchedHouseholdUpdate(householdId, result.matchedCount, "Location not found.");
};

export const updatePantryItem = async (
  householdId: string,
  itemId: string,
  item: PantryItem
): Promise<void> => {
  const result = await getHouseholdsCollection().updateOne(
    { id: householdId, "locations.items.id": itemId },
    { $set: { "locations.$[location].items.$[item]": item }, $inc: { storageRevision: 1 } },
    { arrayFilters: [{ "location.items.id": itemId }, { "item.id": itemId }] }
  );

  await requireMatchedHouseholdUpdate(householdId, result.matchedCount, "Item not found.");
};

export const movePantryItem = async (
  householdId: string,
  itemId: string,
  item: PantryItem,
  targetLocationId: string
): Promise<void> => {
  const result = await getHouseholdsCollection().updateOne(
    { id: householdId, "locations.items.id": itemId, "locations.id": targetLocationId },
    [
      {
        $set: {
          locations: {
            $map: {
              input: "$locations",
              as: "location",
              in: {
                $mergeObjects: [
                  "$$location",
                  {
                    items: {
                      $cond: [
                        { $eq: ["$$location.id", targetLocationId] },
                        {
                          $concatArrays: [
                            {
                              $filter: {
                                input: "$$location.items",
                                as: "existingItem",
                                cond: { $ne: ["$$existingItem.id", itemId] }
                              }
                            },
                            [item]
                          ]
                        },
                        {
                          $filter: {
                            input: "$$location.items",
                            as: "existingItem",
                            cond: { $ne: ["$$existingItem.id", itemId] }
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            }
          },
          storageRevision: { $add: [{ $ifNull: ["$storageRevision", 0] }, 1] }
        }
      }
    ]
  );

  await requireMatchedHouseholdUpdate(householdId, result.matchedCount, "Item or target location not found.");
};

export const deletePantryItem = async (householdId: string, itemId: string): Promise<void> => {
  const result = await getHouseholdsCollection().updateOne(
    { id: householdId, "locations.items.id": itemId },
    { $pull: { "locations.$[].items": { id: itemId } }, $inc: { storageRevision: 1 } }
  );

  await requireMatchedHouseholdUpdate(householdId, result.matchedCount, "Item not found.");
};

export const addShoppingListItem = async (householdId: string, item: ShoppingListItem): Promise<void> => {
  const result = await getHouseholdsCollection().updateOne(
    { id: householdId },
    { $push: { shoppingList: item }, $inc: { storageRevision: 1 } }
  );

  await requireMatchedHouseholdUpdate(householdId, result.matchedCount, "Household not found.");
};

export const updateShoppingListItem = async (
  householdId: string,
  itemId: string,
  item: ShoppingListItem
): Promise<void> => {
  const result = await getHouseholdsCollection().updateOne(
    { id: householdId, "shoppingList.id": itemId },
    { $set: { "shoppingList.$": item }, $inc: { storageRevision: 1 } }
  );

  await requireMatchedHouseholdUpdate(householdId, result.matchedCount, "Shopping list item not found.");
};

export const deleteShoppingListItem = async (householdId: string, itemId: string): Promise<void> => {
  const result = await getHouseholdsCollection().updateOne(
    { id: householdId, "shoppingList.id": itemId },
    { $pull: { shoppingList: { id: itemId } }, $inc: { storageRevision: 1 } }
  );

  await requireMatchedHouseholdUpdate(householdId, result.matchedCount, "Shopping list item not found.");
};

export const deleteDoneShoppingListItems = async (householdId: string): Promise<void> => {
  const result = await getHouseholdsCollection().updateOne(
    { id: householdId },
    { $pull: { shoppingList: { done: true } }, $inc: { storageRevision: 1 } }
  );

  await requireMatchedHouseholdUpdate(householdId, result.matchedCount, "Household not found.");
};

export const findLocation = (household: Household, locationId: string): Location | undefined => {
  return household.locations.find((location) => location.id === locationId);
};

export const findShoppingListItem = (household: Household, itemId: string): ShoppingListItem | undefined => {
  return household.shoppingList.find((item) => item.id === itemId);
};

export const normalizeText = (value: string): string => {
  return value.trim().toLowerCase();
};

export const normalizeExpirationDate = (rawValue: unknown): string | null => {
  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  if (typeof rawValue !== "string") {
    throw new Error("Expiration date must be a string in YYYY-MM-DD format or null.");
  }

  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }

  const isoDateParts = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(trimmedValue);
  const dotDateParts = /^(?<day>\d{2})\.(?<month>\d{2})\.(?<year>\d{4})$/u.exec(trimmedValue);
  const groups = isoDateParts?.groups ?? dotDateParts?.groups;

  if (!groups) {
    throw new Error("Expiration date must use YYYY-MM-DD format.");
  }

  const year = Number(groups.year);
  const month = Number(groups.month);
  const day = Number(groups.day);
  const normalizedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    normalizedDate.getUTCFullYear() !== year ||
    normalizedDate.getUTCMonth() + 1 !== month ||
    normalizedDate.getUTCDate() !== day
  ) {
    throw new Error("Expiration date is not a valid calendar date.");
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
