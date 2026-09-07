import { IconBox } from '../icons.jsx';

export const SEARCH_INDEX = [
  { type: 'product', icon: IconBox, title: 'เหล็ก', subtitle: '฿17.00 / กก. · โลหะ', to: '/products' },
  { type: 'product', icon: IconBox, title: 'ทองแดง', subtitle: '฿218.00 / กก. · โลหะ', to: '/products' },
  { type: 'product', icon: IconBox, title: 'กระดาษลัง', subtitle: '฿10.00 / กก. · กระดาษ', to: '/products' },
  { type: 'product', icon: IconBox, title: 'ขวดพลาสติก', subtitle: '฿12.40 / กก. · พลาสติก', to: '/products' },
  { type: 'product', icon: IconBox, title: 'อลูมิเนียม', subtitle: '฿48.00 / กก. · โลหะ', to: '/products' },
  { type: 'product', icon: IconBox, title: 'สแตนเลส', subtitle: '฿22.50 / กก. · โลหะ', to: '/products' },
];

export const TYPE_LABELS = {
  receipt: 'ใบเสร็จ',
  customer: 'ลูกค้า',
  product: 'สินค้า',
};
