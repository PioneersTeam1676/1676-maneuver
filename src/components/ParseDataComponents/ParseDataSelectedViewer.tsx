import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

/**
 * A component that displays a list of selected files, with the ability to remove
 * them.
 *
 * @param {array} selectedFiles - The list of files that have been selected.
 * @param {function} setSelectedFiles - The function to set the list of selected files.
 * @returns {ReactElement} The rendered component.
 */
const ParseDataSelectedViewer = ({ selectedFiles, setSelectedFiles }: { selectedFiles: File[], setSelectedFiles: React.Dispatch<React.SetStateAction<File[]>> }) => {
  return (
    <>
      <ScrollArea className="w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-2xl h-full max-h-96 min-h-fit border rounded-xl bg-accent overflow-y-scroll">
        <ul>
          {/* Loops over each file in selectedFiles and creates a list item */}
          {selectedFiles.map((file, index) => (
            <li key={index}>
              <div className="flex p-4 justify-between items-center">
                {/* Displays the file name */}
                <span className="text-sm">
                  {file.name}
                </span>

                {/* Displays a clickable 'x' button for removing the file */}
                <button
                  type="button"
                  className="flex text-2xl text-red-500 font-bold items-center"
                  onClick={() => {
                    // Filters out the clicked file from the list
                    setSelectedFiles(
                      selectedFiles.filter((_file, i) => i !== index)
                    );
                  }}
                >
                  x
                </button>
              </div>
            </li>
          ))}
          <Separator />
        </ul>
      </ScrollArea>
    </>
  );
};

export default ParseDataSelectedViewer;
