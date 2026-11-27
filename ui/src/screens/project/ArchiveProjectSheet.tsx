import { useLocation } from 'wouter';
import { useArchive } from '../../api/hooks';
import { paths } from '../../app/routes';
import { Button, Sheet } from '../../ui';

/** Confirm sheet for archiving a project. Goes home only once the archive succeeded. */
export function ArchiveProjectSheet({ project, onClose }: { project: { id: string; name: string }; onClose: () => void }) {
  const [, navigate] = useLocation();
  const archive = useArchive();
  return (
    <Sheet
      title={`Archive ${project.name}?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" label="Cancel" onClick={onClose} />
          <Button
            variant="primary"
            label="Archive"
            disabled={archive.isPending}
            onClick={() =>
              archive.mutate(
                { entity: 'project', id: project.id },
                {
                  onSuccess: () => {
                    onClose();
                    navigate(paths.home);
                  },
                },
              )
            }
          />
        </>
      }
    >
      <span className="gp-sr">{project.name}</span>
    </Sheet>
  );
}
