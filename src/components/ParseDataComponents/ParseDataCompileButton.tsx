/* eslint-disable @typescript-eslint/no-explicit-any */
import Button from "@/components/ui/button";
import type { ReactElement } from "react";
import type { Dispatch, SetStateAction } from "react";
import { convertArrayOfArraysToCSV, SCOUTING_DATA_HEADER } from "@/lib/utils";
import { toast } from "sonner";

/**
 * A component that compiles the selected JSON files into a CSV format required
 * by the analysis software and downloads it to the user's computer.
 *
 * @param {array} selectedFiles - The list of files that have been selected.
 * @param {function} setSelectedFiles - The function to set the list of selected files.
 * @return {ReactElement} The rendered component.
 */
const ParseDataCompileButton = ({ selectedFiles, setSelectedFiles }: { selectedFiles: File[], setSelectedFiles: Dispatch<SetStateAction<File[]>> }): ReactElement => {
  /**
   * Converts the selected JSON files into a CSV format required by the
   * analysis software.
   */
  const convertJSONToCSV = () => {
    const totalFilesData = selectedFiles.map((singleFile) =>
      JSON.parse((singleFile as any).text)
    );

    // Combine all rows, always using the shared header as the first row
    const fullCSV: (string | number)[][] = [];
    fullCSV.push(SCOUTING_DATA_HEADER);
    for (let fileIndex = 0; fileIndex < totalFilesData.length; fileIndex++) {
      const fileData = totalFilesData[fileIndex];
      for (
        let dataRowIndex = 1;
        dataRowIndex < fileData.length;
        dataRowIndex++
      ) {
        const dataRow = fileData[dataRowIndex];
        fullCSV.push(dataRow);
      }
    }

    downloadCSV(convertArrayOfArraysToCSV(fullCSV));
  };

  /**
   * Downloads the CSV content to the user's computer.
   * @param {string} csvContent - The CSV content to download.
   * @return {void}
   */
  const downloadCSV = (csvContent: string): void => {
    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent)
    );
    element.setAttribute(
      "download",
      `PioneerScoutingData-${new Date().toLocaleTimeString()}-Full.csv`
    );

    element.style.display = "none";
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
    // Clear selected files after download
    setSelectedFiles([]);
    toast.success("CSV compiled and downloaded successfully!");
  };

  return (
    <>
      {/* The button to compile and download the CSV */}
      <Button
        className="flex w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-2xl h-16 items-center justify-center p-4 ~text-2xl/5xl text-center"
        onClick={convertJSONToCSV}
      >
        Compile And Download
      </Button>
    </>
  );
};

export default ParseDataCompileButton;
