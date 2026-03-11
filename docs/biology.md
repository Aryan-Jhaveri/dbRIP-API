# Biology Background

This page explains the biology behind the data for lab members who are new to transposable elements. If you already know what TEs are, skip to the [API Reference](api-reference.md).

The file is in reference to the GRCh38/hg38 human genome sample, and not T2T-CHM13 v2.0/hs1 human genome sample (higher quality).

## What Are Transposable Elements?

**Transposable elements (TEs)**, also called **"jumping genes"**, are DNA sequences that can copy themselves and insert into new locations in the genome. They make up nearly half of the human genome.

TEs are sometimes called **retrotransposons** because of how they move: they are transcribed into RNA, reverse-transcribed back into DNA, and then inserted into a new genomic location. This "copy-and-paste" mechanism means the original copy stays put while a new copy appears elsewhere.

## TE Families in dbRIP

The dbRIP database tracks four families of retrotransposons:

| Family | Full Name | Count in dbRIP | Typical Length | Notes |
|--------|-----------|---------------|----------------|-------|
| **ALU** | Alu elements | ~33,700 | ~300 bp | Most abundant TE in humans. Named after the *Alu*I restriction enzyme that cuts them. |
| **LINE1** | Long Interspersed Nuclear Element 1 | ~6,500 | ~6,000 bp (full-length) | The only autonomously active TE in humans — it encodes its own reverse transcriptase. |
| **SVA** | SINE-VNTR-Alu | ~4,700 | ~2,000 bp | A composite element made of parts from other TEs. Youngest TE family in humans. |
| **HERVK** | Human Endogenous Retrovirus K | ~100 | ~9,500 bp | Remnants of ancient retroviral infections. Most are inactive. |

## What Is a "Retrotransposon Insertion Polymorphism" (RIP)?

A **polymorphism** means the insertion exists in some people but not others. When a TE insertion is:

- **Present in some individuals** but absent in others, it's called a **polymorphic insertion**
- **Present in the reference genome** (hg38), it's a **reference insertion**
- **Absent from the reference** but found in population sequencing data, it's a **non-reference insertion**

The `me_category` field in the API distinguishes these:

- `Reference` — the insertion is in the hg38 reference genome
- `Non-reference` — the insertion is found in population data but not in the reference

## Populations

dbRIP includes allele frequencies from the **1000 Genomes Project**, which sequenced individuals from 33 populations grouped into 5 super-populations:

| Super-population | Code | Description | Individual Populations |
|-----------------|------|-------------|----------------------|
| **African** | AFR | Sub-Saharan Africa | YRI, LWK, GWD, MSL, ESN, ACB, ASW |
| **European** | EUR | Europe | CEU, TSI, FIN, GBR, IBS |
| **East Asian** | EAS | East Asia | CHB, JPT, CHS, CDX, KHV |
| **South Asian** | SAS | South Asia | GIH, PJL, BEB, STU, ITU |
| **American** | AMR | Americas (admixed) | MXL, PUR, CLM, PEL |

The API stores allele frequencies for all 26 individual populations plus the 5 super-populations, plus `ALL` (global) and `OTH` (other).

When you query with `?population=EUR&min_freq=0.1`, you're asking: "Show me insertions where at least 10% of Europeans carry this insertion."

## Variant Classes

Each insertion is classified by its global allele frequency:

| Variant Class | Frequency Range | Meaning |
|--------------|----------------|---------|
| **Common** | AF > 0.05 | Found in more than 5% of people |
| **Intermediate** | 0.01 < AF ≤ 0.05 | Moderately common |
| **Rare** | 0.001 < AF ≤ 0.01 | Found in less than 1% |
| **Very Rare** | AF ≤ 0.001 | Extremely uncommon |

## Genomic Annotations

The `annotation` field describes where in the genome the insertion landed:

| Annotation | Meaning |
|-----------|---------|
| `INTRONIC` | Inside a gene's intron (non-coding region between exons) |
| `INTERGENIC` | Between genes |
| `EXONIC` | Inside a coding exon (rare — usually deleterious) |
| `3UTR` / `5UTR` | In the 3' or 5' untranslated region of a gene |

Insertions in exons are rare because they often disrupt gene function and are selected against.

## Coordinates and Assemblies

The database uses **1-based, fully closed coordinates** matching the source CSV. Positions refer to the **hg38** (GRCh38) human genome assembly.

When exporting as BED format, coordinates are converted to **0-based, half-open** (BED convention):

```
Database (1-based):  chr1:758508-758509
BED (0-based):       chr1  758507  758509
```

## Further Reading

- [dbRIP paper](https://academic.oup.com/nar/article/34/suppl_1/D574/1133554) — the original database publication
- [1000 Genomes Project](https://www.internationalgenome.org/) — source of population frequency data
- [Mobile DNA (journal)](https://mobilednajournal.biomedcentral.com/) — research on transposable elements
