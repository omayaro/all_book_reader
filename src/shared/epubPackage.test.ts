import { describe, expect, it } from 'vitest';
import { parseContainerPackagePath, parseOpfSpineHrefs } from './epubPackage';

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="id">
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="notes" href="Text/notes.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
    <itemref idref="ch2" linear="yes"/>
    <itemref idref="notes" linear="no"/>
  </spine>
</package>`;

const NAMESPACED_OPF = `<?xml version="1.0"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf">
  <opf:manifest>
    <opf:item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="c1"/>
  </opf:spine>
</opf:package>`;

describe('parseContainerPackagePath', () => {
  it('reads full-path from container.xml', () => {
    expect(parseContainerPackagePath(CONTAINER)).toBe('OEBPS/content.opf');
  });

  it('throws when rootfile is missing', () => {
    expect(() => parseContainerPackagePath('<container/>')).toThrow(/container.xml/);
  });
});

describe('parseOpfSpineHrefs', () => {
  it('returns linear spine hrefs resolved against the OPF directory', () => {
    expect(parseOpfSpineHrefs(OPF, 'OEBPS/content.opf')).toEqual([
      'OEBPS/Text/ch1.xhtml',
      'OEBPS/Text/ch2.xhtml',
    ]);
  });

  it('parses namespaced item/itemref tags', () => {
    expect(parseOpfSpineHrefs(NAMESPACED_OPF, 'content.opf')).toEqual(['c1.xhtml']);
  });
});
