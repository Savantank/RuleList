import path, { dirname } from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { OUTPUT_CLASH_DIR, OUTPUT_SINGBOX_DIR, OUTPUT_SURGE_DIR } from '../constants/dir';

export const isTruthy = <T>(i: T | 0 | '' | false | null | undefined): i is T => !!i;

export function fastStringArrayJoin(arr: string[], sep: string) {
  const len = arr.length;
  if (len === 0) {
    return '';
  }

  let result = arr[0];

  for (let i = 1; i < len; i++) {
    result += sep;
    result += arr[i];
  }
  return result;
}

interface Write {
  (
    destination: string,
    input: NodeJS.TypedArray | string,
  ): Promise<unknown>
}

export function mkdirp(dir: string) {
  if (fs.existsSync(dir)) {
    return;
  }
  return fsp.mkdir(dir, { recursive: true });
}

export const writeFile: Write = async (destination: string, input, dir = dirname(destination)) => {
  const p = mkdirp(dir);
  if (p) {
    await p;
  }
  return fsp.writeFile(destination, input, { encoding: 'utf-8' });
};

export const removeFiles = async (files: string[]) => Promise.all(files.map((file) => fsp.rm(file, { force: true })));

export function domainWildCardToRegex(domain: string) {
  let result = '^';
  for (let i = 0, len = domain.length; i < len; i++) {
    switch (domain[i]) {
      case '.':
        result += String.raw`\.`;
        break;
      case '*':
        result += '[a-zA-Z0-9-_.]*?';
        break;
      case '?':
        result += '[a-zA-Z0-9-_.]';
        break;
      default:
        result += domain[i];
    }
  }
  result += '$';
  return result;
}

export const identity = <T>(x: T): T => x;

export function appendArrayFromSet<T>(dest: T[], source: Set<T> | Array<Set<T>>, transformer: (item: T) => T = identity) {
  const casted = Array.isArray(source) ? source : [source];
  for (let i = 0, len = casted.length; i < len; i++) {
    const iterator = casted[i].values();
    let step: IteratorResult<T, undefined>;

    while ((step = iterator.next(), !step.done)) {
      dest.push(transformer(step.value));
    }
  }

  return dest;
}

export function output(id: string, type: 'non_ip' | 'ip' | 'domainset') {
  return [
    path.join(OUTPUT_SURGE_DIR, type, id + '.conf'),
    path.join(OUTPUT_CLASH_DIR, type, id + '.txt'),
    path.join(OUTPUT_SINGBOX_DIR, type, id + '.json')
  ] as const;
}

export function withBannerArray(title: string, description: string[] | readonly string[], date: Date, content: string[]) {
  return [
    '#########################################',
    `# ${title}`,
    `# Last Updated: ${date.toISOString()}`,
    `# Size: ${content.length}`,
    ...description.map(line => (line ? `# ${line}` : '#')),
    '#########################################',
    ...content,
    '################## EOF ##################'
  ];
};

export function mergeHeaders(headersA: RequestInit['headers'] | undefined, headersB: RequestInit['headers']) {
  if (headersA == null) {
    return headersB;
  }

  if (Array.isArray(headersB)) {
    throw new TypeError('Array headers is not supported');
  }

  const result = new Headers(headersA);

  if (headersB instanceof Headers) {
    headersB.forEach((value, key) => {
      result.set(key, value);
    });
    return result;
  }

  for (const key in headersB) {
    if (Object.hasOwn(headersB, key)) {
      result.set(key, (headersB)[key]);
    }
  }

  return result;
}
