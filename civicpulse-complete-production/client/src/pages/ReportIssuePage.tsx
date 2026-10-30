import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import MediaDropzone from '../components/MediaDropzone';
import { api, apiErrorMessage } from '../lib/api';
import type { ApiSuccess, SubmissionResult } from '../types';

type Coords = { latitude: number; longitude: number } | null;

export default function ReportIssuePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [coords, setCoords] = useState<Coords>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const locate = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Your browser does not support location access');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocating(false);
        toast.success('Location captured');
      },
      () => {
        setLocating(false);
        toast.error('Could not get your location. Please allow location access and try again.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      toast.error('Attach at least one photo or video');
      return;
    }
    if (!coords) {
      toast.error('Share your location so we can route this to the right ward');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('latitude', String(coords.latitude));
    formData.append('longitude', String(coords.longitude));
    files.forEach((f) => formData.append('media', f));

    setSubmitting(true);
    const toastId = toast.loading('Analyzing your report…');
    try {
      const res = await api.post<ApiSuccess<SubmissionResult>>('/issues/with-media', formData);
      toast.success('Issue submitted!', { id: toastId });
      navigate(`/issues/${res.data.data.issue.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not submit your report'), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Report a civic issue</h1>
      <p className="mt-1 text-sm text-slate-500">
        Add a photo or video, a short description and your location — we'll classify it and route it to the right department automatically.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700">Title</label>
          <input
            required
            minLength={5}
            maxLength={150}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Overflowing drain near the main market"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Description</label>
          <textarea
            required
            minLength={10}
            maxLength={5000}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you see, since when, and any safety risk."
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Photo or video</label>
          <div className="mt-1">
            <MediaDropzone files={files} onChange={setFiles} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Location</label>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {locating ? 'Locating…' : coords ? 'Update my location' : 'Use my current location'}
            </button>
            {coords && (
              <span className="text-xs text-slate-500">
                {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
              </span>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit report'}
        </button>
      </form>
    </div>
  );
}
