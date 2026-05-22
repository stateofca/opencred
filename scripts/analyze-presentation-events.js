/*!
 * Copyright 2023 - 2026 California Department of Motor Vehicles
 * Copyright 2023 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import {formatConsoleSummary, formatExchangeCsv} from
  './presentation-analysis/format-output.js';
import {classifyExchange} from
  './presentation-analysis/classify-exchange.js';
import {computeDurationDistribution} from
  './presentation-analysis/compute-duration-distribution.js';
import {computeProfilePatterns} from
  './presentation-analysis/compute-profile-patterns.js';
import {computeSuccessRate} from
  './presentation-analysis/compute-success-rate.js';
import {groupExchanges} from
  './presentation-analysis/group-exchanges.js';
import {parseEvent} from './presentation-analysis/parse-events.js';

const __dirname = import.meta.dirname;
const LOGS_DIR = path.join(__dirname, '..', 'logs', 'output');

async function main() {
  const files = process.argv.slice(2);
  if(files.length === 0) {
    console.error(
      'Usage: node scripts/analyze-presentation-events.js <csv>...');
    process.exit(1);
  }

  const events = [];
  for(const file of files) {
    const fileEvents = await readEventsFromCsv({file});
    events.push(...fileEvents);
  }

  const grouped = groupExchanges({events});
  const exchanges = [];
  for(const [exchangeId, exchangeEvents] of grouped) {
    exchanges.push(classifyExchange({exchangeId, events: exchangeEvents}));
  }

  const successRate = computeSuccessRate({exchanges});
  const duration = computeDurationDistribution({exchanges});
  const profilePatterns = computeProfilePatterns({exchanges});

  const summary = formatConsoleSummary({
    successRate,
    duration,
    profilePatterns,
    totalEvents: events.length,
    totalExchanges: exchanges.length
  });
  console.log(summary);

  const today = new Date().toISOString().slice(0, 10);
  let dirName = `presentation-analysis-${today}`;
  let outputDir = path.join(LOGS_DIR, dirName);
  let counter = 1;
  while(fs.existsSync(outputDir)) {
    counter++;
    dirName = `presentation-analysis-${today}-${counter}`;
    outputDir = path.join(LOGS_DIR, dirName);
  }
  fs.mkdirSync(outputDir, {recursive: true});

  const analysis = {
    date: today,
    totalEvents: events.length,
    totalExchanges: exchanges.length,
    successRate,
    duration,
    profilePatterns
  };
  fs.writeFileSync(
    path.join(outputDir, 'analysis.json'),
    `${JSON.stringify(analysis, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(outputDir, 'exchange-summary.csv'),
    formatExchangeCsv({exchanges})
  );

  console.error(`Output written to ${outputDir}`);
}

/**
 * Read presentation events from a CSV log export file.
 *
 * @param {object} options - Options.
 * @param {string} options.file - Path to the CSV file.
 * @returns {Promise<Array>} Parsed presentation events.
 */
async function readEventsFromCsv({file}) {
  const events = [];
  const input = fs.createReadStream(file);
  const rl = readline.createInterface({input, crlfDelay: Infinity});
  let messageIndex = -1;
  let isHeader = true;

  for await (const line of rl) {
    if(isHeader) {
      const headers = parseCsvRow(line);
      messageIndex = headers.indexOf('@message');
      if(messageIndex === -1) {
        throw new Error(`Missing @message column in ${file}`);
      }
      isHeader = false;
      continue;
    }

    if(line.trim() === '') {
      continue;
    }

    const fields = parseCsvRow(line);
    const json = fields[messageIndex];
    if(json == null) {
      continue;
    }

    const event = parseEvent({json});
    if(event) {
      events.push(event);
    }
  }

  return events;
}

/**
 * Split a CSV row into fields, respecting quoted regions.
 *
 * @param {string} line - A single CSV row.
 * @returns {Array<string>} Parsed field values.
 */
function parseCsvRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  let index = 0;

  while(index < line.length) {
    const char = line[index];
    if(inQuotes) {
      if(char === '"') {
        if(line[index + 1] === '"') {
          current += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index++;
        continue;
      }
      current += char;
      index++;
      continue;
    }

    if(char === '"') {
      inQuotes = true;
      index++;
      continue;
    }

    if(char === ',') {
      fields.push(current);
      current = '';
      index++;
      continue;
    }

    current += char;
    index++;
  }

  fields.push(current);
  return fields;
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
