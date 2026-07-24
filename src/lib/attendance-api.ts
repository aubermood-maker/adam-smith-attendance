import { supabase } from "@/lib/supabase";

export type EventItem = {
  id: string;
  name: string;
  is_active: boolean;
};

export type Member = {
  id: string;
  event_id: string;
  name: string;
  phone: string;
  is_flagged: boolean;
};

export type Attendance = {
  id: string;
  event_id: string;
  name: string;
  phone: string;
  is_flagged: boolean;
  is_new_registration: boolean;
  checked_at: string;
};

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase 환경변수가 없습니다. NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정해주세요.",
    );
  }
  return supabase;
}

export async function fetchEvents() {
  const { data, error } = await client()
    .from("events")
    .select("id,name,is_active")
    .order("name");
  if (error) throw error;
  return data as EventItem[];
}

export async function createEvent(name: string) {
  const { data, error } = await client()
    .from("events")
    .insert({ name })
    .select("id,name,is_active")
    .single();
  if (error) throw error;
  return data as EventItem;
}

export async function activateEvent(eventId: string) {
  const { error } = await client().rpc("set_active_event", {
    target_event_id: eventId,
  });
  if (error) throw error;
}

export async function fetchMembers(eventId: string) {
  const { data, error } = await client()
    .from("members")
    .select("id,event_id,name,phone,is_flagged")
    .eq("event_id", eventId)
    .order("name");
  if (error) throw error;
  return data as Member[];
}

export async function findMembersByLastDigits(eventId: string, digits: string) {
  const { data, error } = await client()
    .from("members")
    .select("id,event_id,name,phone,is_flagged")
    .eq("event_id", eventId)
    .like("phone", `%${digits}`);
  if (error) throw error;
  return data as Member[];
}

export async function addMember(
  member: Omit<Member, "id">,
) {
  const { data, error } = await client()
    .from("members")
    .insert(member)
    .select("id,event_id,name,phone,is_flagged")
    .single();
  if (error) throw error;
  return data as Member;
}

export async function upsertMembers(
  members: Array<Omit<Member, "id">>,
) {
  if (members.length === 0) return [];
  const { data, error } = await client()
    .from("members")
    .upsert(members, { onConflict: "event_id,phone" })
    .select("id,event_id,name,phone,is_flagged");
  if (error) throw error;
  return data as Member[];
}

export async function updateMember(
  memberId: string,
  values: Pick<Member, "name" | "phone" | "is_flagged">,
) {
  const { error } = await client().from("members").update(values).eq("id", memberId);
  if (error) throw error;
}

export async function deleteMember(memberId: string) {
  const { error } = await client().from("members").delete().eq("id", memberId);
  if (error) throw error;
}

export async function fetchAttendances(eventId: string) {
  const { data, error } = await client()
    .from("attendances")
    .select("id,event_id,name,phone,is_flagged,is_new_registration,checked_at")
    .eq("event_id", eventId)
    .order("checked_at", { ascending: false });
  if (error) throw error;
  return data as Attendance[];
}

export async function addAttendance(
  attendance: Omit<Attendance, "id" | "checked_at">,
) {
  const { data, error } = await client()
    .from("attendances")
    .insert(attendance)
    .select("id,event_id,name,phone,is_flagged,is_new_registration,checked_at")
    .single();
  if (error && error.code !== "23505") throw error;
  return (data as Attendance | null) ?? null;
}

export function subscribeToAttendanceData(onChange: () => void) {
  const activeClient = client();
  const channel = activeClient
    .channel(`attendance-sync-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "members" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "attendances" }, onChange)
    .subscribe();

  return () => {
    void activeClient.removeChannel(channel);
  };
}
