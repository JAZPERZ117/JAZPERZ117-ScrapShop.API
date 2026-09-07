import { useMemo, useState } from 'react';
import { IconProductReport, IconDownload, IconPrint, IconMagnet, IconTrendUp, IconBox, IconCategory, IconClockHistory } from '../icons.jsx';
import { exportCsv } from '../lib/csvExport.js';
import { useProducts } from '../context/ProductsContext.jsx';
import { useReceipts } from '../context/ReceiptsContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import './ProductReport.css';

const DONUT_COLORS = ['#B8720A', '#2D6FE0', '#8B4FD8', '#0E8E82', '#D8477A', '#5B6B77'];
const CIRCUMFERENCE = 2 * Math.PI * 46;

function parseMoney(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}

function parseWeightKg(w) {
  return parseFloat(String(w).replace(/[^\d.]/g, '')) || 0;
}

function parseStockKg(stock) {
  return parseFloat(String(stock).replace(/[^\d.]/g, '')) || 0;
}

function parsePct(s) {
  return parseFloat(String(s).replace(/−/g, '-').replace(/[^\d.-]/g, '')) || 0;
}

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nowStr() {
  return new Date().toLocaleString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const THIS_MONTH_LONG = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'long', year: 'numeric' }).format(new Date());

export default function ProductReport() {
  const { products } = useProducts();
  const { receipts, order: receiptOrder } = useReceipts();
  const { settings } = useSettings();
  const [sortBy, setSortBy] = useState('amt');

  const productIds = Object.keys(products);
  const totalStock = productIds.reduce((sum, id) => sum + parseStockKg(products[id].stock), 0);
  const categoryCount = new Set(productIds.map((id) => products[id].cat)).size;

  const revenueByName = useMemo(() => {
    const byName = {};
    for (const id of receiptOrder) {
      const r = receipts[id];
      if (r.status === 'void') continue;
      for (const it of r.items || []) {
        if (!byName[it.n]) byName[it.n] = { amt: 0, weight: 0 };
        byName[it.n].amt += parseMoney(it.t);
        byName[it.n].weight += parseWeightKg(it.w);
      }
    }
    return byName;
  }, [receipts, receiptOrder]);

  const rank = useMemo(() => {
    const rows = productIds.map((id) => {
      const p = products[id];
      const rev = revenueByName[p.name] || { amt: 0, weight: 0 };
      return { id, name: p.name, bg: p.bg, fg: p.fg, Icon: p.Icon, amt: rev.amt, weight: rev.weight };
    });
    const key = sortBy === 'amt' ? 'amt' : 'weight';
    rows.sort((a, b) => b[key] - a[key]);
    const maxVal = rows[0]?.[key] || 1;
    return rows.map((r, i) => ({ ...r, rank: i + 1, top: i < 2, pct: maxVal ? Math.round((r[key] / maxVal) * 100) : 0 }));
  }, [productIds, products, revenueByName, sortBy]);

  const donutData = useMemo(() => {
    const revenueByCat = {};
    let total = 0;
    for (const id of productIds) {
      const p = products[id];
      const amt = (revenueByName[p.name] || { amt: 0 }).amt;
      revenueByCat[p.cat] = (revenueByCat[p.cat] || 0) + amt;
      total += amt;
    }
    if (total === 0) return [];
    const entries = Object.entries(revenueByCat).filter(([, v]) => v > 0);
    let offset = 0;
    return entries.map(([name, amt], i) => {
      const fraction = amt / total;
      const dash = fraction * CIRCUMFERENCE;
      const seg = { name, amt, pct: Math.round(fraction * 100), color: DONUT_COLORS[i % DONUT_COLORS.length], dash, offset: -offset };
      offset += dash;
      return seg;
    });
  }, [productIds, products, revenueByName]);

  // Sorted by magnitude, not signed value — otherwise a product barely up (+0.1%) would
  // always beat a product that crashed (−20%), even though "biggest mover" should surface
  // whichever price moved furthest in either direction.
  const topMover = [...productIds].sort((a, b) => Math.abs(parsePct(products[b].change)) - Math.abs(parsePct(products[a].change)))[0];
  const topMoverDir = topMover ? products[topMover].dir : 'flat';
  const bestSeller = rank[0];

  const risers = [...productIds].filter((id) => products[id].dir === 'up').sort((a, b) => parsePct(products[b].change) - parsePct(products[a].change)).slice(0, 3);
  const fallers = [...productIds].filter((id) => products[id].dir === 'down').sort((a, b) => parsePct(products[a].change) - parsePct(products[b].change)).slice(0, 3);
  const lowStock = [...productIds].sort((a, b) => parseStockKg(products[a].stock) - parseStockKg(products[b].stock)).slice(0, 3);

  function handleExport() {
    exportCsv(
      'product-report.csv',
      ['อันดับ', 'สินค้า', 'น้ำหนัก (กก.)', 'ยอดเงิน', 'สัดส่วน'],
      rank.map((r) => [r.rank, r.name, r.weight.toFixed(2), r.amt.toFixed(2), `${r.pct}%`])
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            รายงาน <span>›</span> <b>รายงานสินค้า</b>
          </div>
          <h1 className="page-title">รายงานสินค้า</h1>
          <div className="page-sub">อันดับสินค้าขายดี แนวโน้มราคา และสัดส่วนยอดรับซื้อแต่ละประเภท</div>
        </div>
        <div className="head-actions">
          <div className="date-select">
            <IconClockHistory />
            {THIS_MONTH_LONG}
          </div>
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            <IconDownload />
            ส่งออก Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <IconPrint />
            พิมพ์รายงาน
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconMagnet />
          </div>
          <div>
            <div className="stat-label">สินค้าขายดีที่สุด</div>
            <div className="stat-value">{bestSeller?.amt > 0 ? bestSeller.name : '—'}</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              {money(bestSeller?.amt || 0)} สะสม
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconTrendUp />
          </div>
          <div>
            <div className="stat-label">{topMoverDir === 'down' ? 'ราคาลงมากสุด' : 'ราคาขึ้นมากสุด'}</div>
            <div className="stat-value">{topMover ? products[topMover].name : '—'}</div>
            <div className={`stat-foot ${topMoverDir === 'down' ? 'down' : 'up'}`}>
              {topMoverDir === 'down' ? '▼' : '▲'} {topMover ? products[topMover].change : '0.0%'}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconBox />
          </div>
          <div>
            <div className="stat-label">รายการทั้งหมด</div>
            <div className="stat-value">{productIds.length} รายการ</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              {categoryCount} หมวดหมู่
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg, #E4F6F4)', color: 'var(--teal, #0E8E82)' }}>
            <IconBox />
          </div>
          <div>
            <div className="stat-label">สต็อกคงเหลือรวม</div>
            <div className="stat-value">{totalStock.toLocaleString('th-TH')} กก.</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              รอส่งขายต่อ
            </div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ '--detail-w': '340px' }}>
        <div>
          <div className="card card-pad section-gap">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconProductReport />
                  อันดับสินค้าขายดี
                </div>
                <div className="card-sub">เรียงตามยอดรับซื้อสะสม</div>
              </div>
              <div className="filter-tabs">
                <div className={`filter-tab${sortBy === 'amt' ? ' active' : ''}`} onClick={() => setSortBy('amt')} role="button" tabIndex={0}>
                  ตามยอดเงิน
                </div>
                <div className={`filter-tab${sortBy === 'weight' ? ' active' : ''}`} onClick={() => setSortBy('weight')} role="button" tabIndex={0}>
                  ตามน้ำหนัก
                </div>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '6%' }}></th>
                  <th style={{ width: '28%' }}>สินค้า</th>
                  <th style={{ width: '16%' }}>น้ำหนัก</th>
                  <th style={{ width: '16%' }}>ยอดเงิน</th>
                  <th style={{ width: '34%' }}>สัดส่วนยอดรวม</th>
                </tr>
              </thead>
              <tbody>
                {rank.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className={`rank-num${r.top ? ' top' : ''}`}>{r.rank}</div>
                    </td>
                    <td>
                      <div className="row-cell">
                        <div className="row-icon" style={{ background: r.bg, color: r.fg }}>
                          <r.Icon />
                        </div>
                        <div className="row-name">{r.name}</div>
                      </div>
                    </td>
                    <td className="num-cell">{r.weight.toLocaleString('th-TH')} กก.</td>
                    <td className="num-cell">{money(r.amt)}</td>
                    <td>
                      <div className="bar-wrap">
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${r.pct}%` }}></div>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{r.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconCategory />
                  สัดส่วนยอดรับซื้อตามหมวดหมู่
                </div>
                <div className="card-sub">จากยอดรับซื้อสะสมทั้งหมด</div>
              </div>
            </div>
            {donutData.length === 0 ? (
              <div className="empty-hint">ยังไม่มีข้อมูลยอดรับซื้อ</div>
            ) : (
              <div className="donut-wrap">
                <svg viewBox="0 0 120 120" width="140" height="140">
                  <circle cx="60" cy="60" r="46" fill="none" stroke="#E6EAE7" strokeWidth="16" />
                  {donutData.map((d) => (
                    <circle
                      key={d.name}
                      cx="60"
                      cy="60"
                      r="46"
                      fill="none"
                      stroke={d.color}
                      strokeWidth="16"
                      strokeDasharray={`${d.dash} ${CIRCUMFERENCE}`}
                      strokeDashoffset={d.offset}
                      transform="rotate(-90 60 60)"
                    />
                  ))}
                  <text x="60" y="56" textAnchor="middle" fontFamily="Kanit" fontSize="18" fontWeight="600" fill="#152420">
                    {productIds.length}
                  </text>
                  <text x="60" y="72" textAnchor="middle" fontFamily="Sarabun" fontSize="9" fill="#78857F">
                    รายการ
                  </text>
                </svg>
                <div className="donut-legend">
                  {donutData.map((d) => (
                    <div className="donut-legend-row" key={d.name}>
                      <span className="donut-dot" style={{ background: d.color }}></span>
                      <span className="name">{d.name}</span>
                      <span className="pct">{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="summary-sticky">
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconTrendUp />
              ราคาขึ้นมากสุด
            </div>
            {risers.length === 0 && <div className="empty-hint">ไม่มีสินค้าราคาขึ้น</div>}
            {risers.map((id) => (
              <div className="mini-stat-row" key={id}>
                <div className="name">{products[id].name}</div>
                <span className="n up">▲ {products[id].change}</span>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconTrendUp />
              ราคาลงมากสุด
            </div>
            {fallers.map((id) => (
              <div className="mini-stat-row" key={id}>
                <div className="name">{products[id].name}</div>
                <span className={`n${products[id].dir === 'down' ? ' down' : ''}`} style={products[id].dir !== 'down' ? { color: 'var(--ink-500)' } : undefined}>
                  {products[id].dir === 'down' ? '▼ ' : ''}
                  {products[id].change}
                </span>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconBox />
              สินค้าสต็อกเหลือน้อย
            </div>
            {lowStock.map((id) => (
              <div className="mini-stat-row" key={id}>
                <div className="name">{products[id].name}</div>
                <span className="n">{products[id].stock}</span>
              </div>
            ))}
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={() => window.print()}>
            <IconPrint />
            พิมพ์รายงานสินค้า
          </button>
        </div>
      </div>

      <div className="hidden-until-print">
        <div className="a4-doc">
          <div className="a4-doc-top">
            <div className="a4-doc-shop">{settings.shopName}</div>
            <div className="a4-doc-addr">
              {settings.address}
              <br />
              โทร. {settings.phone} &nbsp;|&nbsp; เลขผู้เสียภาษี {settings.taxId}
            </div>
            <div className="a4-doc-title">รายงานสินค้า · {THIS_MONTH_LONG}</div>
          </div>
          <hr className="a4-doc-divider" />

          <div className="a4-doc-meta-grid">
            <div className="a4-doc-meta-row">
              <span>สินค้าขายดีที่สุด</span>
              <b>{bestSeller?.amt > 0 ? bestSeller.name : '—'}</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>ราคาขึ้นมากสุด</span>
              <b>{topMover ? `${products[topMover].name} (▲${products[topMover].change})` : '—'}</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>รายการทั้งหมด</span>
              <b>{productIds.length} รายการ ({categoryCount} หมวดหมู่)</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>สต็อกคงเหลือรวม</span>
              <b>{totalStock.toLocaleString('th-TH')} กก.</b>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>อันดับ</th>
                <th>สินค้า</th>
                <th className="num">น้ำหนัก</th>
                <th className="num">ยอดเงิน</th>
                <th className="num">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {rank.map((r) => (
                <tr key={r.id}>
                  <td>{r.rank}</td>
                  <td>{r.name}</td>
                  <td className="num">{r.weight.toLocaleString('th-TH')} กก.</td>
                  <td className="num">{money(r.amt)}</td>
                  <td className="num">{r.pct}%</td>
                </tr>
              ))}
              <tr className="a4-doc-total-row">
                <td colSpan={2}>รวมทั้งสิ้น</td>
                <td className="num">{rank.reduce((s, r) => s + r.weight, 0).toLocaleString('th-TH')} กก.</td>
                <td className="num">{money(rank.reduce((s, r) => s + r.amt, 0))}</td>
                <td className="num">—</td>
              </tr>
            </tbody>
          </table>

          <div className="a4-doc-summary">
            <div className="a4-doc-sum-row">
              <span>ราคาขึ้นมากสุด: {topMover ? products[topMover].name : '—'}</span>
              <b>▲ {topMover ? products[topMover].change : '0.0%'}</b>
            </div>
            <div className="a4-doc-sum-row">
              <span>สต็อกเหลือน้อยสุด: {lowStock[0] ? products[lowStock[0]].name : '—'}</span>
              <b>{lowStock[0] ? products[lowStock[0]].stock : '—'}</b>
            </div>
            <div className="a4-doc-grand">
              <span>สินค้าขายดีที่สุด</span>
              <span>{bestSeller?.amt > 0 ? bestSeller.name : '—'}</span>
            </div>
          </div>

          <div className="a4-doc-foot">พิมพ์เมื่อ {nowStr()} · ตัวเลขจากระบบ ณ เวลาที่พิมพ์</div>
        </div>
      </div>
    </>
  );
}
