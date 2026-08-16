import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createRecord, getRecord, updateRecord } from '../api';

const EMPTY = { patient_name: '', dob: '', diagnosis: '', notes: '' };

/** One form, two jobs: /records/new (create) and /records/:id/edit (update). */
export default function RecordForm() {
  const { id } = useParams();
  const editing = id != null;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!editing) {
      setForm(EMPTY);
      return;
    }
    getRecord(Number(id))
      .then((r) => setForm({
        patient_name: r.record.patient_name,
        dob: r.record.dob,
        diagnosis: r.record.diagnosis,
        notes: r.record.notes,
      }))
      .catch((e) => setError(e.message));
  }, [editing, id]);

  function set<K extends keyof typeof EMPTY>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = editing ? await updateRecord(Number(id), form) : await createRecord(form);
      navigate(`/records/${r.record.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 560 }}>
      <h2>{editing ? `Sửa hồ sơ #${id}` : 'Tạo hồ sơ mới'}</h2>
      {error && <div className="error-box">Không lưu được: {error}</div>}
      <form onSubmit={onSubmit} data-testid="record-form">
        <label htmlFor="f-name">Họ tên</label>
        <input id="f-name" type="text" required value={form.patient_name}
          onChange={(e) => set('patient_name', e.target.value)} />
        <label htmlFor="f-dob">Ngày sinh</label>
        <input id="f-dob" type="date" required value={form.dob}
          onChange={(e) => set('dob', e.target.value)} />
        <label htmlFor="f-diag">Chẩn đoán</label>
        <input id="f-diag" type="text" required value={form.diagnosis}
          onChange={(e) => set('diagnosis', e.target.value)} />
        <label htmlFor="f-notes">Ghi chú</label>
        <textarea id="f-notes" value={form.notes}
          onChange={(e) => set('notes', e.target.value)} />
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" type="button" onClick={() => navigate(-1)}>Quay lại</button>
          <span className="grow" />
          <button className="btn primary" type="submit" disabled={saving} data-testid="btn-save">
            {saving ? 'Đang lưu…' : 'Lưu hồ sơ'}
          </button>
        </div>
      </form>
    </div>
  );
}
