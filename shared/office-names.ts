import { hash32 } from './hash';
import type { PersonName } from './names';

// Vietnamese names for the characters of the local office. The Habblaud World server keeps an exact copy of
// shared/names.ts (SHA-256 checked) and checks the names that go up against it, so the world projection keeps
// drawing from that pool; this one only names the characters on this machine. No duplicates and no
// near-identical variants (e.g. Thu/Thư), so each character is unmistakable in the office.
const F = [
  'Lan', 'Hương', 'Mai', 'Linh', 'Trang', 'Thảo', 'Ngọc', 'Hà', 'Phương', 'Hạnh',
  'Nhung', 'Yến', 'Vy', 'Chi', 'Hoa', 'Thu', 'Quyên', 'Nga', 'Loan', 'Dung',
  'Hằng', 'Huyền', 'My', 'Ngân', 'Oanh', 'Trinh', 'Uyên', 'Xuân', 'Diệp', 'Giang',
  'Hiền', 'Kiều', 'Liên', 'Nhi', 'Quỳnh', 'Duyên', 'Trâm', 'Vân', 'Ánh', 'Bích',
  'Cúc', 'Diễm', 'Đào', 'Hồng', 'Huệ', 'Nguyệt', 'Nhàn', 'Phượng', 'Sương', 'Thoa',
  'Nhã', 'Tuyết', 'Khuê', 'Ly', 'Thùy', 'Châu', 'Gấm', 'Hân', 'Trúc', 'Tiên',
];
const M = [
  'Minh', 'Hùng', 'Dũng', 'Tuấn', 'Nam', 'Long', 'Hải', 'Quân', 'Khoa', 'Phong',
  'Đức', 'Bảo', 'Huy', 'Khang', 'Thành', 'Trung', 'Sơn', 'Tùng', 'Vinh', 'Hiếu',
  'Cường', 'Đạt', 'Hoàng', 'Kiên', 'Lâm', 'Lộc', 'Nghĩa', 'Phát', 'Quang', 'Tài',
  'Thắng', 'Thịnh', 'Toàn', 'Trí', 'Tú', 'Việt', 'An', 'Bình', 'Công', 'Danh',
  'Duy', 'Hào', 'Hậu', 'Định', 'Khải', 'Lực', 'Mạnh', 'Nhân', 'Phúc', 'Quý',
  'Tâm', 'Thái', 'Thiện', 'Tiến', 'Trọng', 'Sang', 'Vũ', 'Đông', 'Hiệp', 'Khôi',
];

export const OFFICE_NAME_POOL: readonly PersonName[] = Object.freeze(
  // Interleaves so neighboring names in the pool alternate the visual hint.
  F.flatMap((f, i) => [{ name: f, look: 'f' as const }, ...(M[i] ? [{ name: M[i], look: 'm' as const }] : [])]),
);

/**
 * Picks a deterministic office name for `id`, avoiding those already used.
 * If the pool runs out, appends a numeric suffix ("Lan 2").
 */
export function pickOfficeName(id: string, used: ReadonlySet<string>): PersonName {
  const n = OFFICE_NAME_POOL.length;
  const start = hash32(id) % n;
  for (let i = 0; i < n; i++) {
    const cand = OFFICE_NAME_POOL[(start + i) % n];
    if (!used.has(cand.name)) return cand;
  }
  const base = OFFICE_NAME_POOL[start];
  for (let k = 2; ; k++) {
    const name = `${base.name} ${k}`;
    if (!used.has(name)) return { name, look: base.look };
  }
}
