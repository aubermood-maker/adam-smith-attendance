export type EventItem = {
  id: string;
  name: string;
  createdAt: string;
};

export type Customer = {
  eventId: string;
  name: string;
  phone: string;
  isCaution?: boolean;
};

export type AttendanceRecord = Customer & {
  id: string;
  eventName: string;
  checkedAt: string;
  dateKey: string;
};

const EVENTS_KEY = "adam-events";
const ACTIVE_EVENT_KEY = "adam-active-event-id";
const CUSTOMERS_KEY = "adam-customers";
const RECORDS_KEY = "adam-attendance-records";

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function initializeAttendanceStorage() {
  let events = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]") as EventItem[];
  let activeEventId = localStorage.getItem(ACTIVE_EVENT_KEY) || "";
  let customers = JSON.parse(localStorage.getItem(CUSTOMERS_KEY) || "[]") as Customer[];
  let records = JSON.parse(localStorage.getItem(RECORDS_KEY) || "[]") as AttendanceRecord[];

  if (events.length === 0) {
    const defaultEvent: EventItem = {
      id: createId("event"),
      name: "기본 행사",
      createdAt: new Date().toISOString(),
    };
    events = [defaultEvent];
    activeEventId = defaultEvent.id;
  }

  if (!events.some((event) => event.id === activeEventId)) {
    activeEventId = events[0].id;
  }

  const defaultEvent = events[0];
  customers = customers.map((customer) => ({
    ...customer,
    eventId: customer.eventId || defaultEvent.id,
  }));
  records = records.map((record) => ({
    ...record,
    eventId: record.eventId || defaultEvent.id,
    eventName: record.eventName || defaultEvent.name,
  }));

  if (customers.length === 0) {
    customers = [
      { eventId: defaultEvent.id, name: "김민준", phone: "01012341234" },
      { eventId: defaultEvent.id, name: "이지은", phone: "01098765678" },
    ];
  }

  saveEvents(events);
  setActiveEventId(activeEventId);
  saveCustomers(customers);
  saveAttendanceRecords(records);

  return { events, activeEventId, customers, records };
}

export function createEvent(name: string): EventItem {
  return {
    id: createId("event"),
    name,
    createdAt: new Date().toISOString(),
  };
}

export function saveEvents(events: EventItem[]) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

export function setActiveEventId(eventId: string) {
  localStorage.setItem(ACTIVE_EVENT_KEY, eventId);
}

export function saveCustomers(customers: Customer[]) {
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
}

export function saveAttendanceRecords(records: AttendanceRecord[]) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

export function createAttendanceRecord(
  customer: Customer,
  eventName: string,
  checkedAt: Date,
): AttendanceRecord {
  const dateKey = [
    checkedAt.getFullYear(),
    String(checkedAt.getMonth() + 1).padStart(2, "0"),
    String(checkedAt.getDate()).padStart(2, "0"),
  ].join("-");

  return {
    ...customer,
    id: createId("attendance"),
    eventName,
    checkedAt: checkedAt.toISOString(),
    dateKey,
  };
}
