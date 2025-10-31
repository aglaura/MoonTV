import { convertToTraditional } from './locale';

type ConvertibleStringMap = {
  [key: string]: unknown;
  name?: string;
  detail?: string;
  title?: string;
  desc?: string;
  source_name?: string;
  'class'?: string;
  type_name?: string;
};

function tryConvert<T>(value: T): T {
  if (typeof value === 'string') {
    return (convertToTraditional(value) || value) as T;
  }
  return value;
}

export function convertApiSiteToTraditional<T extends ConvertibleStringMap>(
  site: T,
): T {
  return {
    ...site,
    name: tryConvert(site.name),
    detail: tryConvert(site.detail),
  } as T;
}

export function convertSearchResultToTraditional<
  T extends ConvertibleStringMap,
>(result: T): T {
  return {
    ...result,
    title: tryConvert(result.title),
    desc: tryConvert(result.desc),
    source_name: tryConvert(result.source_name),
    'class': tryConvert(result.class),
    type_name: tryConvert(result.type_name),
  } as T;
}

export function convertResultsArray<T extends ConvertibleStringMap>(
  arr: T[],
): T[] {
  return arr.map((r) => convertSearchResultToTraditional(r));
}
