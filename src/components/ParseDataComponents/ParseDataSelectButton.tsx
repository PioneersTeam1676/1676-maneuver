/* eslint-disable @typescript-eslint/no-explicit-any */
import Button from "@/components/ui/button";


/**
 * A component that renders a button for selecting files to be parsed.
 * When a file is selected, it is added to the list of selected files, and its contents
 * are loaded into the component's state.
 *
 * @param {array} selectedFiles - The list of files that have been selected.
 * @param {function} setSelectedFiles - The function to set the list of selected files.
 * @return {ReactElement} The rendered component.
 */
const ParseDataSelectButton = ({ setSelectedFiles }: any) => {
  /**
   * Handles the file selection and reads the contents of each selected file.
   * @param {Event} event - The file input change event.
   */
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    
    // Iterate over each selected file
    for (let itemNum = 0; itemNum < files.length; itemNum++) {
      const file = files.item(itemNum);
      if (!file) continue;

      // Asynchronously read the text content of the file
      const getText = async () => {
        const text = await file.text();
        // Update the list of selected files with the new file and its content
        setSelectedFiles((filesList: any) => [
          ...filesList,
          { name: file.name, text: text },
        ]);
      };
      getText();
    }
  };

  return (
    <>
      {/* Hidden file input element (we hide it because it looks bad)*/}
      <input
        type="file"
        id="selectFiles"
        multiple
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />
      {/* Visible button to trigger file selection */}
      <Button
        variant={"secondary"}
        className="flex w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-2xl h-16 items-center justify-center p-4 ~text-2xl/5xl text-center"
        onClick={() => document.getElementById("selectFiles")?.click()}
      >
        Select Files
      </Button>
    </>
  );
};

export default ParseDataSelectButton;
