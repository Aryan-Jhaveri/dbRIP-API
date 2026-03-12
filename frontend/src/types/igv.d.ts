/**
 * igv.d.ts — TypeScript ambient module declaration for igv.js.
 *
 * WHAT THIS FILE IS:
 *   igv.js is the JavaScript port of the Integrative Genomics Viewer. It does
 *   not ship with TypeScript type declarations, so the TypeScript compiler
 *   would error ("Could not find a declaration file for module 'igv'") without
 *   this file.
 *
 *   An "ambient module declaration" (declare module "...") tells TypeScript:
 *   "When you see `import igv from 'igv'`, here is the shape of what it exports."
 *   No JavaScript output is generated — this file only influences type checking.
 *
 * WHY ONLY THESE TYPES?
 *   igv.js has a much larger API surface, but we only declare the parts actually
 *   used by IgvViewer.tsx. Declaring less is safer than declaring more:
 *   - Fewer types to keep accurate as igv.js updates
 *   - TypeScript will catch real usage errors without needing an exhaustive shim
 *
 *   If you add new igv.js API calls in IgvViewer.tsx and need type safety for
 *   them, add the corresponding declarations here.
 *
 * REFERENCE:
 *   igv.js Browser API: https://github.com/igvteam/igv.js/wiki/Browser-API-2.0
 *   igv.js track configs: https://igv.org/doc/igvjs/tracks/Annotation-Track/
 */

declare module "igv" {
  /**
   * Options passed to igv.createBrowser() to configure the initial state
   * of the genome browser.
   */
  interface BrowserConfig {
    /**
     * Built-in reference genome identifier. Common values:
     *   "hg38" — GRCh38 (current human reference, used by dbRIP)
     *   "hg19" — GRCh37 (older human reference, still common in published studies)
     * igv.js fetches the genome sequence and gene annotations from igv.org's
     * servers when using these built-in IDs.
     */
    genome?: string;

    /**
     * Initial genomic locus to display, e.g. "chr1:1,000,000-1,001,000" or
     * a gene name like "BRCA1". Gene names trigger a search against NCBI.
     */
    locus?: string;

    /**
     * Initial set of tracks to load when the browser starts.
     * Each object is a track config (see TrackConfig below).
     */
    tracks?: TrackConfig[];
  }

  /**
   * Configuration for a single track in the igv browser.
   * The required fields vary by track type — see notes per field.
   */
  interface TrackConfig {
    /**
     * Track type — determines how the data is rendered:
     *   "alignment" — BAM/CRAM reads (shows aligned reads, coverage)
     *   "annotation" — BED/GFF features (shows colored intervals)
     *   "variant"    — VCF variants (shows variant calls per sample)
     */
    type: string;

    /**
     * File format. Must match the actual file format:
     *   "bam", "cram" for alignment tracks
     *   "bed", "gff3", "gtf" for annotation tracks
     *   "vcf" for variant tracks
     */
    format: string;

    /** Display label shown in the track header strip inside the browser. */
    name: string;

    /**
     * Data source. Can be:
     *   - A URL string (http/https) for remote files
     *   - A JavaScript File object for locally-uploaded files (no server upload needed)
     *   igv.js uses the browser's Blob API for random-access reads on File objects.
     */
    url?: File | string;

    /**
     * Index file for random-access formats. Can be a URL or File object.
     * Required for BAM files (.bai index). Optional for BED/VCF when
     * `indexed: false` is set.
     */
    indexURL?: File | string;

    /**
     * Set to false to load the entire file into memory without an index.
     * Fine for small BED/VCF files (< a few MB). Not applicable to BAM
     * files, which always require a .bai index.
     */
    indexed?: boolean;
  }

  /**
   * The live igv browser instance returned by igv.createBrowser().
   * All browser interactions (navigation, track management) happen through
   * this object's methods.
   */
  interface Browser {
    /**
     * Navigate to a genomic locus. Accepts:
     *   - Coordinate string: "chr1:1,000,000-1,001,000"
     *   - Gene name: "BRCA1" (resolved via NCBI gene search)
     * Returns a Promise that resolves when navigation is complete.
     */
    search(locus: string): Promise<void>;

    /**
     * Load a new track into the browser. The track config must specify
     * at minimum type, format, name, and url.
     * Returns a Promise that resolves when the track is loaded.
     */
    loadTrack(config: TrackConfig): Promise<void>;

    /**
     * Remove a track by its display name (the `name` field in its config).
     * If no track with that name exists, this is a no-op.
     */
    removeTrackByName(name: string): void;
  }

  /**
   * Create and mount an igv browser into a DOM element.
   *
   * @param container - The HTMLElement igv should mount into. Must have a
   *   non-zero height set via CSS or inline style, or the browser renders
   *   as invisible (0px tall).
   * @param config - Initial configuration: genome, locus, tracks.
   * @returns A Promise that resolves to the Browser instance once igv has
   *   initialized and rendered its first frame.
   */
  function createBrowser(
    container: HTMLElement,
    config: BrowserConfig
  ): Promise<Browser>;

  /**
   * Destroy a browser instance and remove all its DOM nodes and event
   * listeners. Call this in React's useEffect cleanup (component unmount)
   * to prevent memory leaks.
   */
  function removeBrowser(browser: Browser): void;
}
