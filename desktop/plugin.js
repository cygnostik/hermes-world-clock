/**
 * World Clock for Hermes Desktop.
 *
 * A status-bar chip that shows the time in one place. Click it for a
 * drop-up of every zone you've enabled; pick one and the chip follows it.
 * "Edit zones…" at the bottom of the menu turns zones on and off.
 *
 * Zones are standard IANA time-zone identifiers, formatted by the
 * renderer's built-in Intl API. No network, no backend, no timers beyond
 * one wake-up per minute. Choices persist through ctx.storage.
 *
 * Plain ESM, loaded uncompiled: UI is jsx() calls.
 */

import {
	atom,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	STATUSBAR_AREAS,
	useValue,
} from "@hermes/plugin-sdk";
import { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

// Curated IANA zones: one representative per distinct offset/DST rule that
// people commonly work across. Ordered roughly west to east.
export const ZONES = [
	"Pacific/Honolulu",
	"America/Anchorage",
	"America/Los_Angeles",
	"America/Phoenix",
	"America/Denver",
	"America/Chicago",
	"America/Mexico_City",
	"America/Guatemala",
	"America/Bogota",
	"America/New_York",
	"America/Halifax",
	"America/St_Johns",
	"America/Sao_Paulo",
	"America/Argentina/Buenos_Aires",
	"Atlantic/Azores",
	"UTC",
	"Europe/London",
	"Europe/Paris",
	"Europe/Berlin",
	"Africa/Lagos",
	"Africa/Johannesburg",
	"Europe/Athens",
	"Africa/Cairo",
	"Europe/Istanbul",
	"Europe/Moscow",
	"Asia/Dubai",
	"Asia/Karachi",
	"Asia/Kolkata",
	"Asia/Kathmandu",
	"Asia/Dhaka",
	"Asia/Bangkok",
	"Asia/Jakarta",
	"Asia/Shanghai",
	"Asia/Hong_Kong",
	"Asia/Singapore",
	"Asia/Tokyo",
	"Asia/Seoul",
	"Australia/Perth",
	"Australia/Darwin",
	"Australia/Adelaide",
	"Australia/Brisbane",
	"Australia/Sydney",
	"Pacific/Auckland",
];

// Ids written by the 0.0.x prototype, mapped onto IANA zones.
const LEGACY_IDS = {
	guatemala: "America/Guatemala",
	brisbane: "Australia/Brisbane",
	"los-angeles": "America/Los_Angeles",
	denver: "America/Denver",
	chicago: "America/Chicago",
	"new-york": "America/New_York",
	"mexico-city": "America/Mexico_City",
	"sao-paulo": "America/Sao_Paulo",
	utc: "UTC",
	london: "Europe/London",
	berlin: "Europe/Berlin",
	dubai: "Asia/Dubai",
	india: "Asia/Kolkata",
	singapore: "Asia/Singapore",
	tokyo: "Asia/Tokyo",
	sydney: "Australia/Sydney",
	auckland: "Pacific/Auckland",
};

export function isValidZone(tz) {
	if (typeof tz !== "string" || !tz) return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

export function localZone() {
	try {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return isValidZone(tz) ? tz : "UTC";
	} catch {
		return "UTC";
	}
}

/** The menu list: curated zones plus the user's local zone if it is missing. */
export function zoneList(local = localZone()) {
	return ZONES.includes(local) ? ZONES : [local, ...ZONES];
}

/** "America/Argentina/Buenos_Aires" -> "Buenos Aires". */
export function cityOf(tz) {
	if (tz === "UTC") return "UTC";
	return tz.split("/").pop().replace(/_/g, " ");
}

/** Normalize stored ids (IANA or legacy) to valid, de-duplicated IANA ids. */
export function normalizeIds(ids) {
	if (!Array.isArray(ids)) return [];
	const out = [];
	for (const raw of ids) {
		const tz = LEGACY_IDS[raw] ?? raw;
		if (isValidZone(tz) && !out.includes(tz)) out.push(tz);
	}
	return out;
}

export function defaultEnabled(local = localZone()) {
	return local === "UTC" ? ["UTC"] : [local, "UTC"];
}

const fmtCache = new Map();
function fmt(tz, opts) {
	const key = `${tz}|${JSON.stringify(opts)}`;
	let f = fmtCache.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts });
		fmtCache.set(key, f);
	}
	return f;
}
export const timeOf = (tz, d) => fmt(tz, { hour: "numeric", minute: "2-digit" }).format(d);
export const dayOf = (tz, d) => fmt(tz, { weekday: "short" }).format(d);
/** "UTC+10", "UTC−6", "UTC+5:30", "UTC". */
export function offsetOf(tz, d) {
	const name =
		new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
			.formatToParts(d)
			.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
	const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
	if (!m || (Number(m[2]) === 0 && !Number(m[3] ?? 0))) return "UTC";
	return `UTC${m[1] === "-" ? "\u2212" : "+"}${Number(m[2])}${m[3] ? `:${m[3]}` : ""}`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const $enabled = atom([]);
const $selected = atom("");
let storage = null;

function setEnabled(ids) {
	const order = zoneList();
	const clean = order.filter((tz) => ids.includes(tz));
	if (!clean.length) return;
	$enabled.set(clean);
	storage?.set("enabled", clean);
	if (!clean.includes($selected.get())) setSelected(clean[0]);
}

function setSelected(tz) {
	$selected.set(tz);
	storage?.set("selected", tz);
}

/** Re-render on each minute boundary; one timer per mounted chip. */
function useMinute() {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		let t;
		const arm = () => {
			t = setTimeout(() => {
				setNow(new Date());
				arm();
			}, 60000 - (Date.now() % 60000) + 50);
		};
		arm();
		return () => clearTimeout(t);
	}, []);
	return now;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const CHIP_CLASS =
	"inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground";
const ROW = "gap-2 text-foreground focus:bg-accent";
const MUTED = { color: "var(--ui-text-quaternary)" };
const NUM = { fontVariantNumeric: "tabular-nums" };

function Check({ on }) {
	return jsx("span", {
		"aria-hidden": true,
		style: { width: 12, flex: "none", display: "inline-block", textAlign: "center" },
		children: on ? "\u2713" : "",
	});
}

function ZoneRow({ tz, now, checked, onSelect, trailing }) {
	return jsxs(DropdownMenuItem, {
		className: ROW,
		onSelect,
		children: [
			jsx(Check, { on: checked }),
			jsx("span", { className: "truncate", style: { flex: 1, minWidth: 0 }, children: tz }),
			...trailing,
		],
	});
}

function WorldClock() {
	const now = useMinute();
	const enabled = useValue($enabled);
	const selected = useValue($selected);
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState(false);

	const shown = enabled.includes(selected) ? selected : enabled[0];
	if (!shown) return null;

	const pickRows = enabled.map((tz) =>
		jsx(
			ZoneRow,
			{
				tz,
				now,
				checked: tz === shown,
				onSelect: () => setSelected(tz),
				trailing: [
					jsx("span", { style: MUTED, children: dayOf(tz, now) }, "d"),
					jsx("span", { style: NUM, children: timeOf(tz, now) }, "t"),
				],
			},
			tz,
		),
	);

	const editRows = zoneList().map((tz) => {
		const on = enabled.includes(tz);
		return jsx(
			ZoneRow,
			{
				tz,
				now,
				checked: on,
				onSelect: (e) => {
					e.preventDefault(); // keep the menu open while toggling
					if (on && enabled.length === 1) return; // keep at least one
					setEnabled(on ? enabled.filter((x) => x !== tz) : [...enabled, tz]);
				},
				trailing: [jsx("span", { style: { ...MUTED, ...NUM }, children: offsetOf(tz, now) }, "o")],
			},
			tz,
		);
	});

	const footer = (label, next) =>
		jsx(
			DropdownMenuItem,
			{
				className: ROW,
				onSelect: (e) => {
					e.preventDefault();
					setEditing(next);
				},
				children: jsx("span", { style: { paddingLeft: 20 }, children: label }),
			},
			"footer",
		);

	return jsxs(DropdownMenu, {
		open,
		onOpenChange: (v) => {
			setOpen(v);
			if (!v) setEditing(false);
		},
		children: [
			jsx(DropdownMenuTrigger, {
				asChild: true,
				children: jsx("button", {
					type: "button",
					className: CHIP_CLASS,
					"aria-label": `World clock: ${tz2label(shown, now)}`,
					title: `${shown} \u00b7 ${dayOf(shown, now)} \u00b7 ${offsetOf(shown, now)}`,
					children: jsx("span", {
						className: "truncate",
						style: NUM,
						children: `${cityOf(shown)} ${timeOf(shown, now)}`,
					}),
				}),
			}),
			jsxs(DropdownMenuContent, {
				side: "top",
				align: "end",
				sideOffset: 8,
				className: "w-72",
				style: editing ? { maxHeight: 380, overflowY: "auto" } : undefined,
				children: [
					...(editing ? editRows : pickRows),
					jsx(DropdownMenuSeparator, {}, "sep"),
					editing ? footer("Done", false) : footer("Edit zones\u2026", true),
				],
			}),
		],
	});
}

function tz2label(tz, now) {
	return `${cityOf(tz)} ${timeOf(tz, now)}, ${dayOf(tz, now)}, ${offsetOf(tz, now)}`;
}

/** Load persisted state, falling back to the user's local zone plus UTC. */
export function loadState(store, local = localZone()) {
	let enabled = normalizeIds(store?.get("enabled", null));
	if (!enabled.length) enabled = defaultEnabled(local);
	const rawSel = store?.get("selected", null);
	const sel = LEGACY_IDS[rawSel] ?? rawSel;
	const selected = enabled.includes(sel) ? sel : enabled[0];
	return { enabled, selected };
}

export default {
	id: "world-clock",
	name: "World Clock",
	register(ctx) {
		storage = ctx.storage;
		const { enabled, selected } = loadState(storage);
		$enabled.set(enabled);
		$selected.set(selected);
		storage.set("enabled", enabled);
		storage.set("selected", selected);

		ctx.register({
			id: "clock",
			area: STATUSBAR_AREAS.right,
			order: 5,
			// Declarative item with a render escape hatch: toggleLabel lists the
			// clock in the status bar's right-click show/hide menu.
			data: {
				id: "world-clock",
				toggleLabel: "World clock",
				render: () => jsx(WorldClock, {}),
			},
		});
	},
};
