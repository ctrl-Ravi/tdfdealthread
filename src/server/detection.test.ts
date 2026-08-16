import test from 'node:test';
import assert from 'node:assert';
import { detectRetailer } from './detection.ts';

test('DOMAIN TESTS', async (t) => {
  await t.test('1-5. Amazon domains', () => {
    const urls = ['amazon.in', 'www.amazon.in', 'amzn.to', 'amzn-to.co', 'link.amazon'];
    for (const u of urls) {
      const res = detectRetailer({ url: `https://${u}/test` });
      assert.strictEqual(res.matched, true);
      if (res.matched) {
        assert.strictEqual(res.retailer, 'Amazon');
        assert.strictEqual(res.method, 'domain');
      }
    }
  });

  await t.test('6-10. Flipkart domains', () => {
    const urls = ['flipkart.com', 'fkrt.it', 'fkrt.store', 'fkrt.cc', 'fkrt.co'];
    for (const u of urls) {
      const res = detectRetailer({ url: `https://${u}/test` });
      assert.strictEqual(res.matched, true);
      if (res.matched) {
        assert.strictEqual(res.retailer, 'Flipkart');
        assert.strictEqual(res.method, 'domain');
      }
    }
  });

  await t.test('11-13. Myntra domains', () => {
    const urls = ['myntra.com', 'myntr.in', 'myntr.store'];
    for (const u of urls) {
      const res = detectRetailer({ url: `https://${u}/test` });
      assert.strictEqual(res.matched, true);
      if (res.matched) {
        assert.strictEqual(res.retailer, 'Myntra');
        assert.strictEqual(res.method, 'domain');
      }
    }
  });

  await t.test('14-15. Ajio domains', () => {
    const urls = ['ajio.com', 'ajiio.store'];
    for (const u of urls) {
      const res = detectRetailer({ url: `https://${u}/test` });
      assert.strictEqual(res.matched, true);
      if (res.matched) {
        assert.strictEqual(res.retailer, 'Ajio');
        assert.strictEqual(res.method, 'domain');
      }
    }
  });

  await t.test('16-19. Other domains', () => {
    assert.strictEqual(detectRetailer({ url: 'https://meesho.com' }).matched, true);
    assert.strictEqual(detectRetailer({ url: 'https://croma.com' }).matched, true);
    assert.strictEqual(detectRetailer({ url: 'https://tatacliq.com' }).matched, true);
    assert.strictEqual(detectRetailer({ url: 'https://reliancedigital.in' }).matched, true);
  });
});

test('KEYWORD TESTS', async (t) => {
  await t.test('20. Amazon Deal in title', () => {
    const res = detectRetailer({ title: 'Amazon Deal' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Amazon');
  });

  await t.test('21. AMAZON in title', () => {
    const res = detectRetailer({ title: 'AMAZON' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Amazon');
  });

  await t.test('22. Amazon in body', () => {
    const res = detectRetailer({ body: 'Check out this Amazon sale' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Amazon');
  });

  await t.test('23. Myntra sale in title', () => {
    const res = detectRetailer({ title: 'Myntra sale' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Myntra');
  });

  await t.test('24. Flipkart price drop in body', () => {
    const res = detectRetailer({ body: 'Flipkart price drop' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Flipkart');
  });

  await t.test('25. AJIO offer', () => {
    const res = detectRetailer({ title: 'AJIO offer' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Ajio');
  });
});

test('URL/MARKDOWN TESTS', async (t) => {
  await t.test('26. Markdown URL', () => {
    const res = detectRetailer({ body: '[Buy Now](https://amzn.to/example)' });
    assert.strictEqual(res.matched, true);
    if (res.matched) {
      assert.strictEqual(res.retailer, 'Amazon');
      assert.strictEqual(res.method, 'domain');
    }
  });

  await t.test('27. Plain URL', () => {
    const res = detectRetailer({ body: 'https://fkrt.store/example' });
    assert.strictEqual(res.matched, true);
    if (res.matched) {
      assert.strictEqual(res.retailer, 'Flipkart');
      assert.strictEqual(res.method, 'domain');
    }
  });

  await t.test('28. Amazon keyword with Flipkart URL', () => {
    const res = detectRetailer({ title: 'Amazon Deal', url: 'https://fkrt.store/example' });
    assert.strictEqual(res.matched, true);
    if (res.matched) {
      assert.strictEqual(res.retailer, 'Flipkart');
      assert.strictEqual(res.method, 'domain');
    }
  });

  await t.test('29. Amazon keyword with Myntra URL', () => {
    const res = detectRetailer({ title: 'Amazon Deal', url: 'https://myntr.store/example' });
    assert.strictEqual(res.matched, true);
    if (res.matched) {
      assert.strictEqual(res.retailer, 'Myntra');
      assert.strictEqual(res.method, 'domain');
    }
  });
});

test('FALSE-POSITIVE TESTS', async (t) => {
  await t.test('30. unrelated post', () => {
    assert.strictEqual(detectRetailer({ title: 'Great deal on shoes' }).matched, false);
  });

  await t.test('31. notamazon.in', () => {
    assert.strictEqual(detectRetailer({ url: 'https://notamazon.in' }).matched, false);
  });

  await t.test('32. amazon-fake.example.com', () => {
    assert.strictEqual(detectRetailer({ url: 'https://amazon-fake.example.com' }).matched, false);
  });

  await t.test('33. amazon.in.fake.example.com', () => {
    assert.strictEqual(detectRetailer({ url: 'https://amazon.in.fake.example.com' }).matched, false);
  });

  await t.test('34. notflipkart.com', () => {
    assert.strictEqual(detectRetailer({ url: 'https://notflipkart.com' }).matched, false);
  });

  await t.test('35. notmyntra.com', () => {
    assert.strictEqual(detectRetailer({ url: 'https://notmyntra.com' }).matched, false);
  });

  await t.test('36. empty title/body/url', () => {
    assert.strictEqual(detectRetailer({ title: '', body: '', url: '' }).matched, false);
  });
});

test('PRIORITY TESTS', async (t) => {
  await t.test('37. URL retailer match + unrelated keyword', () => {
    const res = detectRetailer({ title: 'Some shoes', url: 'https://amazon.in/test' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Amazon');
  });

  await t.test('38. URL retailer match + different retailer keyword', () => {
    const res = detectRetailer({ title: 'Amazon Deal', url: 'https://fkrt.store/example' });
    assert.strictEqual(res.matched, true);
    if (res.matched) {
      assert.strictEqual(res.retailer, 'Flipkart');
      assert.strictEqual(res.method, 'domain');
    }
  });

  await t.test('39. Multiple retailer keywords with no domain', () => {
    const res = detectRetailer({ title: 'Amazon Flipkart Myntra Deal' });
    assert.strictEqual(res.matched, true);
    if (res.matched) {
      assert.strictEqual(res.retailer, 'Amazon'); // Amazon is first in RETAILERS
      assert.strictEqual(res.method, 'keyword');
    }
  });
});

test('CASE TESTS', async (t) => {
  await t.test('40. HTTPS uppercase hostname', () => {
    const res = detectRetailer({ url: 'HTTPS://AMAZON.IN/TEST' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Amazon');
  });

  await t.test('41. HTTP URL', () => {
    const res = detectRetailer({ url: 'http://amazon.in/test' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Amazon');
  });

  await t.test('42. www.amazon.in', () => {
    const res = detectRetailer({ url: 'https://www.amazon.in/test' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Amazon');
  });

  await t.test('43. www.fkrt.store', () => {
    const res = detectRetailer({ url: 'https://www.fkrt.store/test' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Flipkart');
  });

  await t.test('44. hostname with trailing dot', () => {
    const res = detectRetailer({ url: 'https://amazon.in./test' });
    assert.strictEqual(res.matched, true);
    if (res.matched) assert.strictEqual(res.retailer, 'Amazon');
  });
});
