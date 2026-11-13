import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../../api';
import { runAction } from '../../components/run-action';
import { SkeletonRows } from '../../components/ui';

export function NoteRoute() {
  const { id, taskId } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (id !== undefined && taskId !== undefined) {
      runAction(Promise.resolve(navigate(`/list/${id}?task=${taskId}`, { replace: true })));
    }
  }, [id, navigate, taskId]);
  return <SkeletonRows />;
}

export function TaskRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ['task', id],
    queryFn: () => api.taskDetail(id ?? ''),
    enabled: id !== undefined,
  });
  useEffect(() => {
    if (detail.data !== undefined) {
      runAction(
        Promise.resolve(
          navigate(`/list/${detail.data.project_id}?task=${detail.data.id}`, { replace: true }),
        ),
      );
    }
  }, [detail.data, navigate]);
  if (detail.isError) {
    return <p>{id}</p>;
  }
  return <SkeletonRows />;
}
