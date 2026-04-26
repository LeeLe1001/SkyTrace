(function () {
    'use strict';

    const DAY_MS = 86400000;
    let airportTimezoneMap = {};

    function setAirportTimezoneMap(map) {
        airportTimezoneMap = map && typeof map === 'object' ? { ...map } : {};
    }

    function estimateUtcOffsetHours(lon) {
        if (lon === undefined || lon === null || Number.isNaN(Number(lon))) return 0;
        return Math.round(Number(lon) / 15);
    }

    function getAirportTimezone(code, airport) {
        if (airport && airport.timezone) return airport.timezone;
        const normalized = String(code || '').trim().toUpperCase();
        return airportTimezoneMap[normalized] || '';
    }

    function getTimeZoneOffsetMinutes(timeZone, date) {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        });
        const parts = {};
        formatter.formatToParts(date).forEach(part => {
            if (part.type !== 'literal') parts[part.type] = part.value;
        });
        const asUtc = Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour),
            Number(parts.minute),
            Number(parts.second)
        );
        return Math.round((asUtc - date.getTime()) / 60000);
    }

    function toUtcMillisFromLocalParts(year, month, day, hour, minute, timeZone, fallbackAirport) {
        if (!timeZone) {
            const fallbackOffset = estimateUtcOffsetHours(fallbackAirport?.lon);
            return Date.UTC(year, month - 1, day, hour, minute) - fallbackOffset * 3600000;
        }

        const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
        let guess = targetUtc;
        for (let i = 0; i < 3; i += 1) {
            const offset = getTimeZoneOffsetMinutes(timeZone, new Date(guess));
            const nextGuess = targetUtc - offset * 60000;
            if (nextGuess === guess) break;
            guess = nextGuess;
        }
        return guess;
    }

    function parseIsoDate(dateStr) {
        const match = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        return {
            year: Number(match[1]),
            month: Number(match[2]),
            day: Number(match[3]),
        };
    }

    function parseClock(clockStr) {
        const match = String(clockStr || '').trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;
        return {
            hour: Number(match[1]),
            minute: Number(match[2]),
        };
    }

    function shiftDate(dateParts, dayOffset) {
        const seed = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
        seed.setUTCDate(seed.getUTCDate() + dayOffset);
        return {
            year: seed.getUTCFullYear(),
            month: seed.getUTCMonth() + 1,
            day: seed.getUTCDate(),
        };
    }

    function getDayOffset(flight) {
        if (flight?.arr_day_offset !== undefined && flight?.arr_day_offset !== null) {
            return Number.parseInt(flight.arr_day_offset, 10) || 0;
        }
        return flight?.arr_next_day ? 1 : 0;
    }

    function resolveFlightInstants(flight, airportsByCode) {
        const baseDate = parseIsoDate(flight?.date);
        const depClock = parseClock(flight?.dep_time);
        const arrClock = parseClock(flight?.arr_time || flight?.dep_time);
        if (!baseDate || !depClock || !arrClock) return null;

        const depAirport = flight?.dep_airport || airportsByCode?.[flight?.departure] || {};
        const arrAirport = flight?.arr_airport || airportsByCode?.[flight?.arrival] || {};
        const depTimeZone = getAirportTimezone(flight?.departure, depAirport);
        const arrTimeZone = getAirportTimezone(flight?.arrival, arrAirport) || depTimeZone;

        const depUtcMs = toUtcMillisFromLocalParts(
            baseDate.year,
            baseDate.month,
            baseDate.day,
            depClock.hour,
            depClock.minute,
            depTimeZone,
            depAirport
        );

        let arrDate = shiftDate(baseDate, getDayOffset(flight));
        let arrUtcMs = toUtcMillisFromLocalParts(
            arrDate.year,
            arrDate.month,
            arrDate.day,
            arrClock.hour,
            arrClock.minute,
            arrTimeZone,
            arrAirport
        );

        if (!getDayOffset(flight)) {
            let guard = 0;
            while (arrUtcMs <= depUtcMs && guard < 4) {
                arrDate = shiftDate(arrDate, 1);
                arrUtcMs = toUtcMillisFromLocalParts(
                    arrDate.year,
                    arrDate.month,
                    arrDate.day,
                    arrClock.hour,
                    arrClock.minute,
                    arrTimeZone,
                    arrAirport
                );
                guard += 1;
            }
        }

        return {
            depUtcMs,
            arrUtcMs,
            depTimeZone,
            arrTimeZone,
            depAirport,
            arrAirport,
        };
    }

    function calculateDurationMinutes(flight, airportsByCode) {
        const timeline = resolveFlightInstants(flight, airportsByCode);
        if (!timeline) return null;
        const diff = Math.round((timeline.arrUtcMs - timeline.depUtcMs) / 60000);
        return diff > 0 ? diff : null;
    }

    function formatDuration(flight, airportsByCode) {
        const minutes = calculateDurationMinutes(flight, airportsByCode);
        if (!minutes) return '';
        return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }

    window.SkyTraceTime = {
        DAY_MS,
        setAirportTimezoneMap,
        getAirportTimezone,
        getDayOffset,
        resolveFlightInstants,
        calculateDurationMinutes,
        formatDuration,
    };
})();
