import { convertToTraditional } from './locale';

function tryConvert(value: any): any {
  if (typeof value === 'string') {
    return convertToTraditional(value) || value;
  }
  return value;
}

export function convertApiSiteToTraditional(site: any) {
  return {
    ...site,
    name: tryConvert(site.name),
    detail: tryConvert(site.detail),
  };
}

export function convertSearchResultToTraditional(result: any) {
  return {
    ...result,
    title: tryConvert(result.title),
    desc: tryConvert(result.desc),
    source_name: tryConvert(result.source_name),
    class: tryConvert(result.class),
    type_name: tryConvert(result.type_name),
  };
}

export function convertResultsArray(arr: any[]) {
  return arr.map((r) => convertSearchResultToTraditional(r));
}
