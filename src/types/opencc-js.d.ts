declare module 'opencc-js' {
  interface ConverterOptions {
    from?: string;
    to?: string;
    dict?: Record<string, unknown>;
  }

  interface OpenCCModule {
    Converter(options?: ConverterOptions): (text: string) => string;
  }

  const opencc: OpenCCModule;
  export default opencc;
}
