function normalizeFitData(data) {
  const activity = data?.activity || {};
  const sessions =
    arrayOrEmpty(data?.sessions).length ? data.sessions :
      arrayOrEmpty(activity?.sessions);

  const session = sessions[0] || {};

  const rootRecords = arrayOrEmpty(data?.records);
  const nestedRecords = collectNestedRecords(activity);

  const recordsSource = rootRecords.length ? rootRecords : nestedRecords;
  const records = recordsSource.map(mapRecord);
  const maxMeanPower = computeMaxMeanPower(records);

  return {
    fileId: data?.file_id || activity?.file_id || null,
    sport: session?.sport || activity?.sport || null,
    subSport: session?.sub_sport || null,
    startTime: session?.start_time || inferStartTime(records),
    endTime: session?.timestamp || inferEndTime(records),
    totalDuration: toSeconds(session?.total_elapsed_time ?? session?.total_timer_time),
    totalDurationMs: toMilliseconds(session?.total_elapsed_time ?? session?.total_timer_time),
    totalDistance: numberOrNull(session?.total_distance),
    totalAscent: numberOrNull(session?.total_ascent),
    avgSpeed: numberOrNull(session?.avg_speed),
    avgHeartRate: numberOrNull(session?.avg_heart_rate),
    avgPower: numberOrNull(session?.avg_power),
    records,
    maxMeanPower  // NEU
  };
}

function collectNestedRecords(activity) {
  const sessions = arrayOrEmpty(activity?.sessions);
  const allRecords = [];

  for (const session of sessions) {
    const laps = arrayOrEmpty(session?.laps);

    for (const lap of laps) {
      const lapRecords = arrayOrEmpty(lap?.records);
      allRecords.push(...lapRecords);
    }

    const sessionRecords = arrayOrEmpty(session?.records);
    allRecords.push(...sessionRecords);
  }

  return allRecords;
}

function mapRecord(record) {
  const altitude =
    record?.enhanced_altitude ??
    record?.altitude;

  const speed =
    record?.enhanced_speed ??
    record?.speed;

  return {
    timestamp: record?.timestamp || null,
    elapsed_time: numberOrNull(record?.elapsed_time),
    distance: numberOrNull(record?.distance),

    // NEU: Fallback auf enhanced_*
    altitude: numberOrNull(altitude),
    speed: numberOrNull(speed),

    heart_rate: numberOrNull(record?.heart_rate),
    power: numberOrNull(record?.power),
    cadence: numberOrNull(record?.cadence),
    temperature: numberOrNull(record?.temperature),
    position_lat: convertCoord(record?.position_lat),
    position_long: convertCoord(record?.position_long)
  };
}

function convertCoord(value) {
  if (typeof value !== 'number') return null;
  if (Math.abs(value) <= 180) return value;
  return value * (180 / Math.pow(2, 31));
}

function inferStartTime(records) {
  return records.find(r => r.timestamp)?.timestamp || null;
}

function inferEndTime(records) {
  const last = [...records].reverse().find(r => r.timestamp);
  return last?.timestamp || null;
}

function toSeconds(value) {
  return typeof value === 'number' ? value : null;
}

function toMilliseconds(value) {
  return typeof value === 'number' ? value * 1000 : null;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function computeMaxMeanPower(records, targetDurations = [60, 300, 600, 1200, 3600]) {
  // targetDurations in Sekunden: [1min, 5min, 10min, 20min, 60min]
  const powerRecords = records.filter(r =>
    r.power != null &&
    r.power > 0 &&
    r.elapsed_time != null
  );

  if (powerRecords.length < 2) return {};

  const result = {};

  for (const targetSeconds of targetDurations) {
    let maxAvg = 0;
    let bestStartIdx = 0;
    let bestEndIdx = 0;

    for (let i = 0; i < powerRecords.length; i++) {
      const startTime = powerRecords[i].elapsed_time;
      const endTime = startTime + targetSeconds;

      // Finde alle Records in diesem Zeitfenster
      const windowRecords = [];
      for (let j = i; j < powerRecords.length; j++) {
        if (powerRecords[j].elapsed_time >= startTime &&
          powerRecords[j].elapsed_time < endTime) {
          windowRecords.push(powerRecords[j]);
        }
        if (powerRecords[j].elapsed_time >= endTime) break;
      }

      // Mindestens 80% der erwarteten Dauer erfüllt
      if (windowRecords.length > 0) {
        const actualDuration =
          windowRecords[windowRecords.length - 1].elapsed_time -
          windowRecords[0].elapsed_time;

        if (actualDuration >= targetSeconds * 0.8) {
          const avgPower = windowRecords.reduce((sum, r) => sum + r.power, 0) / windowRecords.length;

          if (avgPower > maxAvg) {
            maxAvg = avgPower;
            bestStartIdx = i;
            bestEndIdx = i + windowRecords.length - 1;
          }
        }
      }
    }

    if (maxAvg > 0) {
      const label = targetSeconds < 60
        ? `${targetSeconds}s`
        : `${Math.floor(targetSeconds / 60)}min`;

      result[label] = {
        watts: Math.round(maxAvg),
        startIndex: bestStartIdx,
        endIndex: bestEndIdx,
        startTime: powerRecords[bestStartIdx]?.elapsed_time,
        endTime: powerRecords[bestEndIdx]?.elapsed_time
      };
    }
  }

  return result;
}

module.exports = { normalizeFitData };